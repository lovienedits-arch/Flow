"""
FLOW Tracking Service — Track feature for family/parent-child
Request flow: sender searches username -> send request -> receiver accept/decline -> both can see each other's live location if accepted
"""
import time, sqlite3
from services.auth_service import get_db, get_user_by_id

def send_request(sender_id, receiver_username):
    receiver_username = receiver_username.strip().lower()
    conn = get_db()
    cur = conn.cursor()
    recv = cur.execute("SELECT id,username FROM users WHERE username=?", (receiver_username,)).fetchone()
    if not recv:
        conn.close()
        return None, "User not found"
    receiver_id = recv["id"]
    if sender_id == receiver_id:
        conn.close()
        return None, "Cannot track yourself"
    existing = cur.execute("SELECT status FROM track_requests WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)",
                           (sender_id, receiver_id, receiver_id, sender_id)).fetchone()
    if existing:
        if existing["status"] == "pending":
            conn.close()
            return None, "Request already pending"
        if existing["status"] == "accepted":
            conn.close()
            return None, "Already connected"
        # if declined, allow resend by deleting old
        if existing["status"] == "declined":
            cur.execute("DELETE FROM track_requests WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)",
                        (sender_id, receiver_id, receiver_id, sender_id))
    cur.execute("INSERT INTO track_requests (sender_id,receiver_id,status,created_at) VALUES (?,?,?,?)",
                (sender_id, receiver_id, "pending", int(time.time())))
    conn.commit()
    rid = cur.lastrowid
    conn.close()
    return {"request_id": rid, "receiver": receiver_username, "status": "pending"}, None

def list_requests_for_user(user_id):
    conn = get_db()
    cur = conn.cursor()
    incoming = cur.execute("""
        SELECT tr.id, tr.status, tr.created_at, u.username as sender_username, u.display_name as sender_display, u.id as sender_id
        FROM track_requests tr JOIN users u ON tr.sender_id=u.id WHERE tr.receiver_id=? AND tr.status='pending' ORDER BY tr.created_at DESC
    """, (user_id,)).fetchall()
    outgoing = cur.execute("""
        SELECT tr.id, tr.status, tr.created_at, u.username as receiver_username, u.display_name as receiver_display, u.id as receiver_id
        FROM track_requests tr JOIN users u ON tr.receiver_id=u.id WHERE tr.sender_id=? ORDER BY tr.created_at DESC
    """, (user_id,)).fetchall()
    connections = cur.execute("""
        SELECT tr.id, tr.status, u.id as peer_id, u.username as peer_username, u.display_name as peer_display
        FROM track_requests tr
        JOIN users u ON ( (tr.sender_id=? AND u.id=tr.receiver_id) OR (tr.receiver_id=? AND u.id=tr.sender_id) )
        WHERE (tr.sender_id=? OR tr.receiver_id=?) AND tr.status='accepted'
    """, (user_id, user_id, user_id, user_id)).fetchall()
    conn.close()
    return {
        "incoming": [dict(r) for r in incoming],
        "outgoing": [dict(r) for r in outgoing],
        "connections": [dict(r) for r in connections]
    }

def act_on_request(user_id, request_id, action):
    if action not in ("accept","decline","cancel"):
        return None, "Invalid action"
    conn = get_db()
    cur = conn.cursor()
    req = cur.execute("SELECT * FROM track_requests WHERE id=?", (request_id,)).fetchone()
    if not req:
        conn.close()
        return None, "Request not found"
    # For accept/decline, must be receiver pending
    if action in ("accept","decline"):
        if req["receiver_id"] != user_id:
            conn.close()
            return None, "Not authorized"
        if req["status"] != "pending":
            conn.close()
            return None, "Already handled"
        new_status = "accepted" if action=="accept" else "declined"
        cur.execute("UPDATE track_requests SET status=? WHERE id=?", (new_status, request_id))
        conn.commit()
        conn.close()
        return {"status": new_status}, None
    if action == "cancel":
        if req["sender_id"] != user_id:
            conn.close()
            return None, "Not authorized"
        cur.execute("DELETE FROM track_requests WHERE id=?", (request_id,))
        conn.commit()
        conn.close()
        return {"status": "cancelled"}, None
    conn.close()
    return None, "Error"

def can_track(viewer_id, target_user_id):
    # viewer can track target if there's accepted connection between them
    conn = get_db()
    cur = conn.cursor()
    row = cur.execute("SELECT id FROM track_requests WHERE status='accepted' AND ((sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?))",
                      (viewer_id, target_user_id, target_user_id, viewer_id)).fetchone()
    conn.close()
    return bool(row)

def update_location(user_id, lat, lon, accuracy=None):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT OR REPLACE INTO live_locations (user_id,lat,lon,updated_at,accuracy) VALUES (?,?,?,?,?)",
                (user_id, lat, lon, int(time.time()), accuracy))
    conn.commit()
    conn.close()
    return True

def get_location(user_id):
    conn = get_db()
    cur = conn.cursor()
    row = cur.execute("SELECT lat,lon,updated_at,accuracy FROM live_locations WHERE user_id=?", (user_id,)).fetchone()
    conn.close()
    if row:
        d = dict(row)
        # consider stale if > 5 min old
        d["stale"] = (int(time.time()) - d["updated_at"]) > 300
        return d
    return None

def get_tracked_people(viewer_id):
    # Return list of accepted connections with their live locations
    conn = get_db()
    cur = conn.cursor()
    peers = cur.execute("""
        SELECT u.id as peer_id, u.username as peer_username, u.display_name as peer_display, tr.id as request_id
        FROM track_requests tr
        JOIN users u ON ( (tr.sender_id=? AND u.id=tr.receiver_id) OR (tr.receiver_id=? AND u.id=tr.sender_id) )
        WHERE (tr.sender_id=? OR tr.receiver_id=?) AND tr.status='accepted'
    """, (viewer_id, viewer_id, viewer_id, viewer_id)).fetchall()
    result = []
    for p in peers:
        loc = get_location(p["peer_id"])
        result.append({"peer_id": p["peer_id"], "username": p["peer_username"], "display_name": p["peer_display"], "location": loc})
    conn.close()
    return result
