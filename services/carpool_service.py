"""
Flow Carpool Service — matches users going same route at same time to suggest shared rides.
Emission-aware: groups riders to reduce vehicles on road.
"""
import time
import math
import sqlite3
from services.auth_service import get_db

def init_carpool_tables():
    conn = get_db()
    cur = conn.cursor()
    # User_carpool profile stores okay flag + car details
    cur.execute('''CREATE TABLE IF NOT EXISTS carpool_profiles (
        user_id INTEGER PRIMARY KEY,
        okay_with_carpool INTEGER DEFAULT 0,
        car_model TEXT,
        car_number TEXT,
        seats_available INTEGER DEFAULT 3,
        fuel_type TEXT DEFAULT 'Petrol',
        updated_at INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )''')
    # Offers: user publishes a trip they are willing to share
    cur.execute('''CREATE TABLE IF NOT EXISTS carpool_offers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        origin_lat REAL NOT NULL,
        origin_lon REAL NOT NULL,
        dest_lat REAL NOT NULL,
        dest_lon REAL NOT NULL,
        origin_name TEXT,
        dest_name TEXT,
        departure_time INTEGER, -- epoch seconds
        seats_total INTEGER DEFAULT 3,
        seats_taken INTEGER DEFAULT 0,
        car_model TEXT,
        car_number TEXT,
        fuel_type TEXT,
        status TEXT DEFAULT 'open', -- open, full, completed, cancelled
        created_at INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )''')
    # Joins: who joined which offer
    cur.execute('''CREATE TABLE IF NOT EXISTS carpool_joins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        offer_id INTEGER NOT NULL,
        rider_id INTEGER NOT NULL,
        status TEXT DEFAULT 'confirmed', -- confirmed, cancelled
        joined_at INTEGER,
        UNIQUE(offer_id, rider_id),
        FOREIGN KEY(offer_id) REFERENCES carpool_offers(id),
        FOREIGN KEY(rider_id) REFERENCES users(id)
    )''')
    conn.commit()
    conn.close()

init_carpool_tables()

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2
    return 2*R*math.asin(math.sqrt(a))

def set_carpool_profile(user_id, okay, car_model=None, car_number=None, seats_available=3, fuel_type='Petrol'):
    conn = get_db()
    cur = conn.cursor()
    cur.execute('''INSERT INTO carpool_profiles (user_id, okay_with_carpool, car_model, car_number, seats_available, fuel_type, updated_at)
                   VALUES (?,?,?,?,?,?,?)
                   ON CONFLICT(user_id) DO UPDATE SET okay_with_carpool=excluded.okay_with_carpool,
                   car_model=excluded.car_model, car_number=excluded.car_number, seats_available=excluded.seats_available,
                   fuel_type=excluded.fuel_type, updated_at=excluded.updated_at
    ''', (user_id, 1 if okay else 0, car_model, car_number, seats_available, fuel_type, int(time.time())))
    conn.commit()
    conn.close()
    return get_carpool_profile(user_id)

def get_carpool_profile(user_id):
    conn = get_db()
    cur = conn.cursor()
    row = cur.execute('SELECT * FROM carpool_profiles WHERE user_id=?', (user_id,)).fetchone()
    conn.close()
    if row:
        d = dict(row)
        d['okay_with_carpool'] = bool(d['okay_with_carpool'])
        return d
    # default: not okay
    return {"user_id": user_id, "okay_with_carpool": False, "car_model": "", "car_number": "", "seats_available": 3, "fuel_type": "Petrol"}

def create_offer(user_id, origin, dest, origin_name, dest_name, departure_time=None, seats_total=None):
    # origin, dest are [lon, lat]
    conn = get_db()
    cur = conn.cursor()
    # get profile for car details
    profile = get_carpool_profile(user_id)
    if not profile['okay_with_carpool']:
        conn.close()
        return None, "Enable carpool in profile first"
    # departure defaults to soon: now + 30min
    if departure_time is None:
        departure_time = int(time.time()) + 1800
    else:
        try:
            departure_time = int(departure_time)
        except:
            departure_time = int(time.time()) + 1800

    car_model = profile.get('car_model') or 'Car'
    car_number = profile.get('car_number') or ''
    fuel_type = profile.get('fuel_type') or 'Petrol'
    seats = seats_total or profile.get('seats_available') or 3
    # check existing open offer for same route within 5 min to avoid duplicates
    # For now allow multiple but we could dedup

    cur.execute('''INSERT INTO carpool_offers
        (user_id, origin_lat, origin_lon, dest_lat, dest_lon, origin_name, dest_name, departure_time, seats_total, seats_taken, car_model, car_number, fuel_type, status, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ''', (user_id, origin[1], origin[0], dest[1], dest[0], origin_name or '', dest_name or '', departure_time, seats, 0, car_model, car_number, fuel_type, 'open', int(time.time())))
    conn.commit()
    oid = cur.lastrowid
    conn.close()
    return {"offer_id": oid, "status": "open"}, None

def list_my_offers(user_id):
    conn = get_db()
    cur = conn.cursor()
    rows = cur.execute('SELECT * FROM carpool_offers WHERE user_id=? ORDER BY created_at DESC LIMIT 20', (user_id,)).fetchall()
    # also joined
    joined = cur.execute('''SELECT o.*, u.username as driver_username, u.display_name as driver_display
        FROM carpool_joins j JOIN carpool_offers o ON j.offer_id=o.id JOIN users u ON o.user_id=u.id
        WHERE j.rider_id=? AND j.status='confirmed' ORDER BY o.departure_time DESC LIMIT 20''', (user_id,)).fetchall()
    conn.close()
    return {"created": [dict(r) for r in rows], "joined": [dict(r) for r in joined]}

def find_matches_for_route(origin, dest, departure_within_mins=45, limit=6, exclude_user_id=None):
    """
    Find carpool offers going same corridor.
    Criteria: origin within 2.5km of query origin, dest within 2.5km of query dest, departure within window, open, not full.
    Returns sorted by closest corridor distance + soonest departure
    """
    try:
        olat, olon = origin[1], origin[0]
        dlat, dlon = dest[1], dest[0]
    except:
        return []

    now = int(time.time())
    window = departure_within_mins * 60
    # also include offers departing soon: now -10min to now+window
    min_time = now - 600
    max_time = now + window

    conn = get_db()
    cur = conn.cursor()
    rows = cur.execute('''SELECT o.*, u.username, u.display_name FROM carpool_offers o JOIN users u ON o.user_id=u.id
                          WHERE o.status='open' AND o.departure_time BETWEEN ? AND ? AND o.seats_taken < o.seats_total
                          ORDER BY o.departure_time ASC LIMIT 50''', (min_time, max_time)).fetchall()
    conn.close()

    matches = []
    for r in rows:
        if exclude_user_id and r['user_id'] == exclude_user_id:
            continue
        # already joined?
        # compute corridor proximity
        o_dist = haversine(olat, olon, r['origin_lat'], r['origin_lon'])
        d_dist = haversine(dlat, dlon, r['dest_lat'], r['dest_lon'])
        # corridor threshold 2.5km origin, 2.5km dest, or combined 4km
        if o_dist <= 2.5 and d_dist <= 2.5:
            score = o_dist + d_dist + (abs(r['departure_time'] - (now+900))/3600)*0.5  # smaller is better
            # emission savings estimate
            # Assume each car would emit ~0.12kg CO2 per km (approx). Shared ride saves (n-1)/n ?
            # For simplicity: if 2 people share, save ~45% of one car's emission for that distance
            # Estimate distance along route: use haversine between offer origin/dest
            route_km = haversine(r['origin_lat'], r['origin_lon'], r['dest_lat'], r['dest_lon'])
            # if route_km small due to straight line, approximate via haversine; for Bengaluru typical 8-15km
            # CO2 saved ≈ 0.12 * route_km * 0.45 * (seats_taken+1)/seats_total factor
            co2_saved = round(0.12 * route_km * 0.9, 2)  # approx 0.9 factor for car vs bike
            # If multiple riders, more saving
            potential_saving = round(co2_saved * (1 + r['seats_taken']*0.3), 2)
            matches.append({
                "offer_id": r['id'],
                "driver_username": r['username'],
                "driver_display": r['display_name'] or r['username'],
                "origin_name": r['origin_name'],
                "dest_name": r['dest_name'],
                "origin": [r['origin_lon'], r['origin_lat']],
                "dest": [r['dest_lon'], r['dest_lat']],
                "origin_distance_km": round(o_dist, 2),
                "dest_distance_km": round(d_dist, 2),
                "departure_time": r['departure_time'],
                "departure_in_mins": max(0, int((r['departure_time'] - now)/60)),
                "seats_total": r['seats_total'],
                "seats_taken": r['seats_taken'],
                "seats_left": r['seats_total'] - r['seats_taken'],
                "car_model": r['car_model'],
                "car_number": r['car_number'],
                "fuel_type": r['fuel_type'],
                "route_km": round(route_km, 1),
                "co2_saved_kg": potential_saving,
                "corridor_score": round(score, 2)
            })
    matches.sort(key=lambda x: x['corridor_score'])
    return matches[:limit]

def join_offer(rider_id, offer_id):
    conn = get_db()
    cur = conn.cursor()
    offer = cur.execute('SELECT * FROM carpool_offers WHERE id=?', (offer_id,)).fetchone()
    if not offer:
        conn.close()
        return None, "Offer not found"
    if offer['user_id'] == rider_id:
        conn.close()
        return None, "You own this offer"
    if offer['status'] != 'open':
        conn.close()
        return None, "Offer not open"
    if offer['seats_taken'] >= offer['seats_total']:
        conn.close()
        return None, "Car full"
    # check already joined
    existing = cur.execute('SELECT id FROM carpool_joins WHERE offer_id=? AND rider_id=?', (offer_id, rider_id)).fetchone()
    if existing:
        conn.close()
        return None, "Already joined"
    # check rider profile okay?
    # Not required but we can allow anyone to join even if not offering

    cur.execute('INSERT INTO carpool_joins (offer_id, rider_id, status, joined_at) VALUES (?,?,?,?)',
                (offer_id, rider_id, 'confirmed', int(time.time())))
    cur.execute('UPDATE carpool_offers SET seats_taken = seats_taken + 1 WHERE id=?', (offer_id,))
    # if now full, update status
    cur.execute('UPDATE carpool_offers SET status = CASE WHEN seats_taken >= seats_total THEN "full" ELSE status END WHERE id=?', (offer_id,))
    conn.commit()
    conn.close()
    return {"joined": True, "offer_id": offer_id}, None

def cancel_join(rider_id, offer_id):
    conn = get_db()
    cur = conn.cursor()
    existing = cur.execute('SELECT id FROM carpool_joins WHERE offer_id=? AND rider_id=? AND status="confirmed"', (offer_id, rider_id)).fetchone()
    if not existing:
        conn.close()
        return None, "Not joined"
    cur.execute('DELETE FROM carpool_joins WHERE offer_id=? AND rider_id=?', (offer_id, rider_id))
    cur.execute('UPDATE carpool_offers SET seats_taken = MAX(0, seats_taken -1), status="open" WHERE id=?', (offer_id,))
    conn.commit()
    conn.close()
    return {"cancelled": True}, None
