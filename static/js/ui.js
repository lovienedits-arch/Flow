function formatDuration(mins){
  if(mins===null||mins===undefined) return '--';
  mins=Math.round(mins);
  if(mins<60) return `${mins} mins`;
  const h=Math.floor(mins/60); const m=mins%60;
  return m ? `${h} hr ${m} mins` : `${h} hr`;
}

const UI = {
  isCityMode:false,
  currentScenario:'normal',
  currentHorizon:'now',
  lastRoutes:null,
  lastTraffic:null,
  selectedRouteId:null,
  trackPoll: null,
  liveShareInterval: null,

  setupInteractions(){
    // Theme
    document.querySelectorAll('.theme-btn').forEach(b=>{
      b.onclick=()=>{
        document.querySelectorAll('.theme-btn').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        const th=b.dataset.theme; localStorage.setItem('flow-theme', th);
        document.documentElement.setAttribute('data-theme', th);
        applyMapTheme(th); toast(`Theme: ${th}`);
      };
    });
    const savedTheme=localStorage.getItem('flow-theme')||'system';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.querySelectorAll('.theme-btn').forEach(b=> b.classList.toggle('active', b.dataset.theme===savedTheme));

    // Mode
    document.getElementById('mode-driver').onclick=(e)=> this.setMode('driver', e.target);
    document.getElementById('mode-city').onclick=(e)=> this.setMode('city', e.target);
    // Layers
    document.getElementById('layer-traffic').onchange=(e)=> setTrafficVisibility(e.target.checked, document.getElementById('layer-risk').checked);
    document.getElementById('layer-forecast').onchange=()=> this.refreshTraffic();
    document.getElementById('layer-risk').onchange=(e)=> this.toggleRisk(e.target.checked);
    // Forecast
    document.querySelectorAll('.segmented button').forEach(b=>{
      b.onclick=()=>{
        document.querySelectorAll('.segmented button').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        this.currentHorizon=b.dataset.horizon; this.refreshTraffic();
      };
    });
    document.getElementById('btn-simulate-toggle').onclick=()=> document.getElementById('simulator-panel').classList.toggle('hidden');
    document.getElementById('btn-run-sim').onclick=()=> this.runSimulation();
    document.getElementById('btn-close-route').onclick=()=> document.getElementById('route-panel').classList.add('hidden');
    document.getElementById('btn-close-insight').onclick=()=> document.getElementById('insight-card').classList.add('hidden');
    document.getElementById('btn-insight-route').onclick=()=>{
      document.getElementById('insight-card').classList.add('hidden');
      if(this.lastRoutes){ const rec=this.lastRoutes.find(r=>r.is_recommended)||this.lastRoutes[0]; this.selectRoute(rec.id); }
    };
    document.getElementById('btn-alert-close').onclick=()=> document.getElementById('ai-alert').classList.add('hidden');
    document.getElementById('btn-alert-route').onclick=()=>{
      document.getElementById('ai-alert').classList.add('hidden');
      if(this.lastRoutes){ const rec=this.lastRoutes.find(r=>r.is_recommended)||this.lastRoutes[0]; this.selectRoute(rec.id);}
      else document.getElementById('btn-route').click();
    };
    document.getElementById('btn-start-nav').onclick=()=> this.startLiveNavigation();
    document.getElementById('btn-close-about').onclick=()=> document.getElementById('about-modal').classList.add('hidden');
    document.querySelector('[data-action="about"]').onclick=()=> document.getElementById('about-modal').classList.remove('hidden');
    document.getElementById('about-modal').onclick=(e)=>{ if(e.target.id==='about-modal') e.currentTarget.classList.add('hidden'); };

    // Profile menu
    const profileBtn=document.getElementById('profile-btn');
    const profileMenu=document.getElementById('profile-menu');
    profileBtn.onclick=()=> profileMenu.classList.toggle('hidden');
    document.addEventListener('click',(e)=>{ if(!profileBtn.contains(e.target)&&!profileMenu.contains(e.target)) profileMenu.classList.add('hidden'); });
    document.querySelector('[data-action="appearance"]').onclick=()=> document.getElementById('appearance-sub').classList.toggle('hidden');
    document.querySelector('[data-action="saved"]').onclick=()=>{ this.refreshSavedList(); document.getElementById('saved-places-list').classList.toggle('hidden'); };
    document.getElementById('btn-auth-open').onclick=()=> this.showAuth();
    document.getElementById('btn-signout').onclick=()=> this.handleSignOut();
    document.getElementById('btn-open-track').onclick=()=> this.toggleTrackPanel();
    document.getElementById('btn-open-carpool').onclick=()=> this.toggleCarpoolPanel();

    // Track panel
    document.getElementById('btn-close-track').onclick=()=> document.getElementById('track-panel').classList.add('hidden');
    document.getElementById('btn-track-search').onclick=()=> this.searchTrackUsers();
    document.getElementById('track-search-input').addEventListener('keydown', (e)=>{ if(e.key==='Enter') this.searchTrackUsers(); });
    document.getElementById('btn-track-send').onclick=()=> this.sendTrackRequest();
    document.getElementById('track-live-toggle').onchange=(e)=> this.toggleLiveShare(e.target.checked);

    // Carpool panel
    document.getElementById('btn-close-carpool').onclick=()=> document.getElementById('carpool-panel').classList.add('hidden');
    document.getElementById('carpool-ok').onchange=(e)=> document.getElementById('carpool-fields').classList.toggle('hidden', !e.target.checked);
    document.getElementById('btn-save-carpool').onclick=()=> this.saveCarpoolProfile();
    document.getElementById('btn-offer-carpool').onclick=()=> this.offerCarpool();

    // Collapse
    document.getElementById('btn-collapse-search').onclick=()=>{
      const p=document.getElementById('search-panel'); p.classList.toggle('hidden');
      document.getElementById('btn-collapse-search').textContent = p.classList.contains('hidden')?'◰':'—';
    };

    // Auth modal tabs
    const showLogin=()=>{
      document.getElementById('tab-login').classList.add('active'); document.getElementById('tab-register').classList.remove('active');
      document.getElementById('form-login').classList.remove('hidden'); document.getElementById('form-register').classList.add('hidden');
      document.getElementById('auth-error').classList.add('hidden');
    };
    const showRegister=()=>{
      document.getElementById('tab-register').classList.add('active'); document.getElementById('tab-login').classList.remove('active');
      document.getElementById('form-register').classList.remove('hidden'); document.getElementById('form-login').classList.add('hidden');
      document.getElementById('auth-error').classList.add('hidden');
    };
    document.getElementById('tab-login').onclick=showLogin;
    document.getElementById('tab-register').onclick=showRegister;
    document.getElementById('link-to-register').onclick=(e)=>{e.preventDefault(); showRegister();};
    document.getElementById('link-to-login').onclick=(e)=>{e.preventDefault(); showLogin();};
    document.getElementById('btn-guest').onclick=()=>{ document.getElementById('auth-modal').classList.add('hidden'); localStorage.setItem('flow_guest','1'); };
    const googleHandler=()=> this.handleGoogle();
    const g1=document.getElementById('btn-google'); if(g1) g1.onclick=googleHandler;
    const g2=document.getElementById('btn-google-reg'); if(g2) g2.onclick=googleHandler;
    document.getElementById('form-login').onsubmit=async (e)=>{e.preventDefault(); await this.handleLogin();};
    document.getElementById('form-register').onsubmit=async (e)=>{e.preventDefault(); await this.handleRegister();};

    // Check auth on load
    this.checkAuth();

    // Secure context hint
    if(window.isSecureContext===false){
      const hint=document.getElementById('secure-hint');
      if(hint) hint.classList.remove('hidden');
    }
    // Init saved + weather
    this.refreshSavedList();
    this.loadWeather();

    // Firebase ready
    window.addEventListener('flow-firebase-ready', ()=> this.initFirebase());
    if(window._FLOW_AUTH) this.initFirebase();
  },

  async checkAuth(){
    const token=localStorage.getItem('flow_token');
    if(!token){
      // Show auth modal if not guest
      if(!localStorage.getItem('flow_guest')){
        document.getElementById('auth-modal').classList.remove('hidden');
      }
      this.updateProfileUI(null);
      return;
    }
    try{
      const me=await API.me();
      if(me.user){
        this.updateProfileUI(me.user);
        document.getElementById('auth-modal').classList.add('hidden');
        this.startTrackPolling();
        this.loadCarpoolProfile();
      } else {
        this.updateProfileUI(null);
        if(!localStorage.getItem('flow_guest')) document.getElementById('auth-modal').classList.remove('hidden');
      }
    }catch{
      this.updateProfileUI(null);
    }
  },

  showAuth(){ document.getElementById('auth-modal').classList.remove('hidden'); },
  hideAuth(){ document.getElementById('auth-modal').classList.add('hidden'); },

  async handleLogin(){
    const u=document.getElementById('login-user').value.trim();
    const p=document.getElementById('login-pass').value;
    if(!u||!p) return this.authError('Fill username and password');
    const res=await API.login(u,p);
    if(res.error) return this.authError(res.error);
    localStorage.setItem('flow_token', res.token);
    localStorage.removeItem('flow_guest');
    this.updateProfileUI({username: res.username, display_name: res.display_name});
    this.hideAuth(); toast(`Welcome ${res.username}`);
    this.startTrackPolling();
    this.loadWeather();
    this.loadCarpoolProfile();
  },
  async handleRegister(){
    const u=document.getElementById('reg-user').value.trim();
    const d=document.getElementById('reg-display').value.trim()||u;
    const p=document.getElementById('reg-pass').value;
    const p2=document.getElementById('reg-pass2').value;
    if(p!==p2) return this.authError('Passwords do not match');
    const res=await API.register(u,p,d);
    if(res.error) return this.authError(res.error);
    localStorage.setItem('flow_token', res.token);
    localStorage.removeItem('flow_guest');
    this.updateProfileUI({username: res.username, display_name: res.display_name});
    this.hideAuth(); toast(`Account created for ${res.username}`);
    this.loadCarpoolProfile();
    this.startTrackPolling();
    this.loadWeather();
  },
  async handleGoogle(){
    if(!window._FLOW_AUTH){
      toast('Google sign-in not configured — use username');
      return;
    }
    try{
      const auth=window._FLOW_AUTH.getAuth();
      const provider=new window._FLOW_AUTH.GoogleAuthProvider();
      const cred=await window._FLOW_AUTH.signInWithPopup(auth, provider);
      const user=cred.user;
      // Create backend account mirroring? For Flow we treat Google user as logged in via Firebase; store display name
      this.updateProfileUI({username: user.email.split('@')[0], display_name: user.displayName||user.email});
      this.hideAuth();
      localStorage.setItem('flow_guest','1'); // mark guest but with Google name? could also map to username later
      toast(`Google: ${user.displayName}`);
    }catch(e){toast('Google failed: '+e.message);}
  },
  async handleSignOut(){
    await API.logout().catch(()=>{});
    localStorage.removeItem('flow_token');
    localStorage.removeItem('flow_guest');
    this.updateProfileUI(null);
    this.stopTrackPolling();
    // Also sign out Firebase if present
    try{ if(window._FLOW_AUTH){ const auth=window._FLOW_AUTH.getAuth(); await window._FLOW_AUTH.signOut(auth);} }catch{}
    this.showAuth();
    toast('Logged out');
  },
  authError(msg){
    const el=document.getElementById('auth-error'); el.textContent=msg; el.classList.remove('hidden');
  },
  updateProfileUI(user){
    if(user){
      document.getElementById('profile-name').textContent=user.username;
      document.getElementById('pm-name').textContent=user.display_name||user.username;
      document.getElementById('pm-email').textContent='@'+user.username+' • Track enabled';
      document.getElementById('btn-auth-open').classList.add('hidden');
      document.getElementById('btn-signout').classList.remove('hidden');
      document.getElementById('avatar-mini').textContent=user.username[0].toUpperCase();
      document.getElementById('avatar-large').textContent=user.username[0].toUpperCase();
    } else {
      document.getElementById('profile-name').textContent='Guest';
      document.getElementById('pm-name').textContent='Guest Mode';
      document.getElementById('pm-email').textContent='Log in to save & Track';
      document.getElementById('btn-auth-open').classList.remove('hidden');
      document.getElementById('btn-signout').classList.add('hidden');
      document.getElementById('avatar-mini').textContent='◐';
      document.getElementById('avatar-large').textContent='◐';
    }
  },

  toggleTrackPanel(){
    const p=document.getElementById('track-panel');
    p.classList.toggle('hidden');
    if(!p.classList.contains('hidden')){
      this.refreshTrack();
    }
  },

  async searchTrackUsers(){
    const q=document.getElementById('track-search-input').value.trim();
    if(q.length<2) return toast('Enter at least 2 chars');
    const res=await API.searchUsers(q);
    const cont=document.getElementById('track-search-results');
    if(!res.results || !res.results.length){ cont.innerHTML='<div class="muted">No users found</div>'; document.getElementById('btn-track-send').classList.add('hidden'); return;}
    cont.innerHTML=res.results.map(u=>`<div class="track-user" data-username="${u.username}"><div><strong>${u.username}</strong><br><small>${u.display_name}</small></div><span class="badge">Select</span></div>`).join('');
    cont.querySelectorAll('.track-user').forEach(el=>{
      el.onclick=()=>{
        cont.querySelectorAll('.track-user').forEach(x=>x.classList.remove('selected'));
        el.classList.add('selected');
        document.getElementById('btn-track-send').classList.remove('hidden');
        document.getElementById('btn-track-send').dataset.username=el.dataset.username;
      };
    });
  },
  async sendTrackRequest(){
    const username=document.getElementById('btn-track-send').dataset.username;
    if(!username) return;
    const res=await API.trackRequest(username);
    if(res.error) return toast(res.error);
    toast(`Request sent to ${username}`);
    this.refreshTrack();
  },
  async refreshTrack(){
    if(!localStorage.getItem('flow_token')){ document.getElementById('track-incoming').innerHTML='<small class="muted">Log in to use Track</small>'; return; }
    const data=await API.trackRequests();
    if(data.error){ document.getElementById('track-incoming').innerHTML=`<small class="muted">${data.error}</small>`; return;}
    // Incoming
    const inc=document.getElementById('track-incoming');
    if(!data.incoming || !data.incoming.length) inc.innerHTML='<small class="muted">No incoming requests</small>';
    else inc.innerHTML=data.incoming.map(r=>`<div class="track-request"><div><strong>${r.sender_username}</strong><br><small>${r.sender_display}</small></div><div><button class="btn-primary small" data-accept="${r.id}">Accept</button> <button class="btn-ghost small" data-decline="${r.id}">Decline</button></div></div>`).join('');
    inc.querySelectorAll('[data-accept]').forEach(b=>{
      b.onclick=async ()=>{
        const id=b.dataset.accept;
        const res=await API.trackAction(id,'accept');
        if(res.error) toast(res.error); else {toast('Accepted'); this.refreshTrack();}
      };
    });
    inc.querySelectorAll('[data-decline]').forEach(b=>{
      b.onclick=async ()=>{
        const id=b.dataset.decline;
        await API.trackAction(id,'decline'); toast('Declined'); this.refreshTrack();
      };
    });
    // Connections as Family
    const connEl=document.getElementById('track-connections');
    const conns=data.connections || [];
    if(!conns.length) {
      connEl.innerHTML='<small class="muted">No family members yet — search above to add many</small>';
      updateTrackPoints([]);
    } else {
      // Header count
      const familyHeader=`<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Family members (${conns.length}) — dot shows live location</div>`;
      const live = await API.trackLive().catch(()=>({people:[]}));
      const mapLive = {};
      (live.people||[]).forEach(p=> mapLive[p.username]=p);
      connEl.innerHTML=familyHeader + conns.map(c=>{
        const liveInfo=mapLive[c.peer_username];
        const loc = liveInfo?.location;
        const hasLoc = !!loc;
        const stale = loc?.stale;
        const dotClass = !hasLoc?'off': stale?'stale':'';
        const dotTitle = !hasLoc?'Waiting for location permission': stale?'Last seen a while ago':'Live now — dot on map';
        const sub = hasLoc? `${loc.lat.toFixed(4)}, ${loc.lon.toFixed(4)} ${stale?'(stale)':'(live)'}` : 'No live location yet — they need to enable Share';
        return `<div class="track-conn"><div><strong>${c.peer_username}</strong> <span class="track-dot ${dotClass}" title="${dotTitle}"></span> <small>· ${c.peer_display||c.peer_username}</small><br><small>${sub}</small></div><div><button class="btn-secondary small" data-view="${c.peer_username}" ${hasLoc?'':'disabled'}>● View dot</button></div></div>`;
      }).join('');
      connEl.querySelectorAll('[data-view]').forEach(b=>{
        b.onclick=()=>{
          const uname=b.dataset.view;
          const person=(live.people||[]).find(p=>p.username===uname);
          if(person && person.location){
            map.flyTo({center:[person.location.lon, person.location.lat], zoom:15});
            // also highlight track dot
            map.setPaintProperty('track-circles', 'circle-radius', 22);
            setTimeout(()=> map.setPaintProperty('track-circles','circle-radius',18), 800);
            toast(`Family • ${uname} live dot`);
          }
        };
      });
      updateTrackPoints(live.people||[]);
    }
  },

  startTrackPolling(){
    this.stopTrackPolling();
    this.refreshTrack();
    this.trackPoll=setInterval(()=> this.refreshTrack(), 10000);
  },
  stopTrackPolling(){
    if(this.trackPoll) clearInterval(this.trackPoll);
    this.trackPoll=null;
  },
  async toggleLiveShare(on){
    if(on){
      if(!navigator.geolocation){toast('Geolocation not supported — family dot needs HTTPS or manual share'); document.getElementById('track-live-toggle').checked=false; return;}
      if(window.isSecureContext===false){
        toast('Live sharing needs HTTPS — use https://localhost or your family can share via map search. Dot will show when they share.');
        document.getElementById('track-live-toggle').checked=false;
        return;
      }
      // Check permission if available
      try{
        if(navigator.permissions && navigator.permissions.query){
          const perm=await navigator.permissions.query({name:'geolocation'});
          if(perm.state==='denied'){
            toast('Location permission denied — enable in browser settings, or family can set location via search/map');
            document.getElementById('track-live-toggle').checked=false;
            return;
          }
        }
      }catch{}
      toast('Sharing live location — dot will appear for family');
      const send=()=>{
        navigator.geolocation.getCurrentPosition(pos=>{
          API.trackUpdate(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        }, (err)=>{
          let m=err.message||'';
          if(m.includes('Only secure origins') || !window.isSecureContext){
            toast('Live sharing blocked: Use HTTPS/localhost. You can still appear by searching address as workaround.');
            document.getElementById('track-live-toggle').checked=false;
            if(this.liveShareInterval) clearInterval(this.liveShareInterval);
          } else if(err.code===1) toast('Permission denied for location');
          else toast('Live update failed: '+m);
        }, {enableHighAccuracy:true, timeout:8000});
      };
      send();
      this.liveShareInterval=setInterval(send, 10000);
    } else {
      if(this.liveShareInterval) clearInterval(this.liveShareInterval);
      this.liveShareInterval=null;
      toast('Stopped sharing');
    }
  },

  toggleCarpoolPanel(){
    const p=document.getElementById('carpool-panel');
    p.classList.toggle('hidden');
    if(!p.classList.contains('hidden')){
      this.loadCarpoolProfile();
      this.refreshCarpoolOffers();
    }
  },
  async loadCarpoolProfile(){
    if(!localStorage.getItem('flow_token')){ document.getElementById('carpool-pref-status').textContent='Log in to set carpool preference'; return; }
    try{
      const prof=await API.carpoolProfile();
      if(prof.error){ document.getElementById('carpool-pref-status').textContent=prof.error; return; }
      document.getElementById('carpool-ok').checked=!!prof.okay_with_carpool;
      document.getElementById('carpool-fields').classList.toggle('hidden', !prof.okay_with_carpool);
      document.getElementById('carpool-model').value=prof.car_model||'';
      document.getElementById('carpool-number').value=prof.car_number||'';
      document.getElementById('carpool-seats').value=prof.seats_available||3;
      document.getElementById('carpool-fuel').value=prof.fuel_type||'Petrol';
      document.getElementById('carpool-pref-status').textContent= prof.okay_with_carpool ? `Carpool enabled • ${prof.car_model||'Car'} • ${prof.seats_available} seats` : 'Carpool disabled';
    }catch(e){ document.getElementById('carpool-pref-status').textContent='Failed to load'; }
  },
  async saveCarpoolProfile(){
    if(!localStorage.getItem('flow_token')){ toast('Log in first'); this.showAuth(); return; }
    const data={
      okay_with_carpool: document.getElementById('carpool-ok').checked,
      car_model: document.getElementById('carpool-model').value.trim(),
      car_number: document.getElementById('carpool-number').value.trim(),
      seats_available: parseInt(document.getElementById('carpool-seats').value),
      fuel_type: document.getElementById('carpool-fuel').value
    };
    if(data.okay_with_carpool && !data.car_model){ toast('Enter car model'); return; }
    const res=await API.saveCarpoolProfile(data);
    if(res.error) toast(res.error);
    else { toast('Carpool preference saved'); document.getElementById('carpool-pref-status').textContent=data.okay_with_carpool?'Enabled ✓':'Disabled'; }
  },
  async refreshCarpoolOffers(){
    if(!localStorage.getItem('flow_token')) return;
    try{
      const data=await API.carpoolOffers();
      const my=document.getElementById('carpool-my-offers');
      const joined=document.getElementById('carpool-joined');
      if(!data.created || !data.created.length) my.innerHTML='<small class="muted">No offers yet — create from route</small>';
      else my.innerHTML=data.created.map(o=>`<div class="carpool-item"><div><strong>${o.origin_name||'Origin'} → ${o.dest_name||'Dest'}</strong><br><small>${new Date(o.departure_time*1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} • ${o.seats_taken}/${o.seats_total} seats • ${o.car_model}</small></div><span class="badge" style="background:#dcfce7;color:#166534">${o.status}</span></div>`).join('');
      if(!data.joined || !data.joined.length) joined.innerHTML='<small class="muted">Not joined any</small>';
      else joined.innerHTML=data.joined.map(o=>`<div class="carpool-item"><div><strong>${o.origin_name||''} → ${o.dest_name||''}</strong><br><small>with ${o.driver_username} • ${o.car_model} • ${new Date(o.departure_time*1000).toLocaleString()}</small></div><button class="btn-ghost small" data-leave="${o.id}">Leave</button></div>`).join('');
      joined.querySelectorAll('[data-leave]').forEach(b=>{ b.onclick=async()=>{ const r=await API.carpoolLeave(b.dataset.leave); if(r.error) toast(r.error); else {toast('Left carpool'); this.refreshCarpoolOffers();} }; });
    }catch{}
  },
  async offerCarpool(){
    if(!localStorage.getItem('flow_token')){ toast('Log in to offer carpool'); this.showAuth(); return; }
    if(!currentOriginCoords || !currentDestCoords){ toast('Set origin and destination first'); return; }
    // Check profile
    const prof=await API.carpoolProfile();
    if(!prof.okay_with_carpool){ toast('Enable carpool in settings first'); this.toggleCarpoolPanel(); return; }
    const mins=parseInt(document.getElementById('carpool-depart-select').value);
    const dep=Math.floor(Date.now()/1000)+mins*60;
    const originName=document.getElementById('origin-input').value||'Origin';
    const destName=document.getElementById('dest-input').value||'Destination';
    const res=await API.createCarpoolOffer({origin: currentOriginCoords, dest: currentDestCoords, origin_name: originName, dest_name: destName, departure_time: dep});
    const statusEl=document.getElementById('carpool-offer-status');
    if(res.error){ statusEl.textContent=res.error; toast(res.error); }
    else { statusEl.textContent='Offer created for '+mins+' mins — others will see it!'; toast('Carpool offered ✓'); this.refreshCarpoolOffers(); }
  },
  showCarpoolSuggestion(matches){
    const cont=document.getElementById('carpool-suggestion');
    const list=document.getElementById('carpool-matches');
    const count=document.getElementById('carpool-count');
    if(!matches || !matches.length){
      cont.classList.add('hidden');
      return;
    }
    cont.classList.remove('hidden');
    count.textContent=matches.length;
    // Emission total if all carpool vs solo
    const totalCO2=matches.reduce((a,m)=>a+m.co2_saved_kg,0).toFixed(1);
    list.innerHTML = `<div style="font-size:11px;color:#065f46;background:#ecfdf5;padding:6px 8px;border-radius:8px;margin-bottom:8px">💚 ${matches.length} people going same way • Pool by ${matches[0].departure_in_mins} mins saves ~${totalCO2} kg CO₂ vs solo cars</div>` +
      matches.map(m=>`<div class="carpool-match"><h4>👥 ${m.driver_display} <small>@${m.driver_username}</small> <span class="badge" style="background:#dcfce7;color:#166534">${m.seats_left} seats</span></h4><div style="font-size:12px;color:var(--text-muted)">${m.origin_name||'Origin'} → ${m.dest_name||'Dest'} • ${m.route_km} km • <b>${m.car_model}</b> ${m.car_number? '('+m.car_number+')':''} • ${m.fuel_type}</div><div style="font-size:11px;color:var(--text-soft)">Departs in ${m.departure_in_mins} mins • ${m.origin_distance_km}km from your origin • Saves ${m.co2_saved_kg} kg CO₂</div><button class="btn-primary small" data-join="${m.offer_id}" style="margin-top:6px">Join carpool — save emissions</button></div>`).join('');
    list.querySelectorAll('[data-join]').forEach(b=>{
      b.onclick=async()=>{
        const r=await API.carpoolJoin(b.dataset.join);
        if(r.error) toast(r.error);
        else { toast('Joined carpool! Check Carpool panel'); b.textContent='Joined ✓'; b.disabled=true; this.refreshCarpoolOffers(); }
      };
    });
  },

  startLiveNavigation(){
    if(!currentDestCoords){ toast('Set destination first'); return; }
    if(window.isSecureContext===false){
      toast('Live navigation needs HTTPS — showing static route. Use https://localhost for live GPS.');
      toast('Following Flow Recommended — tap map for manual updates');
      return;
    }
    if(!navigator.geolocation){ toast('Live navigation not supported'); return; }
    if(window.isNavigating){ this.stopLiveNavigation(); return; }
    window.isNavigating=true;
    document.getElementById('btn-start-nav').textContent='● Navigating — Tap to stop';
    document.getElementById('btn-start-nav').style.background='#16a34a';
    toast('Live navigation started — blue dot follows you, reroutes live');
    const onPos=(pos)=>{
      const lon=pos.coords.longitude, lat=pos.coords.latitude;
      if(typeof updateLiveNav==='function') updateLiveNav(lon, lat);
      const dest=currentDestCoords;
      if(dest){
        const remaining= this._haversine(lon, lat, dest[0], dest[1]);
        const el=document.getElementById('route-distance');
        if(el) el.textContent=`${remaining.toFixed(1)} km remaining • Live`;
        if(!this._lastNavPos || this._haversine(lon,lat,this._lastNavPos[0],this._lastNavPos[1])>0.08){
          this._lastNavPos=[lon,lat];
          currentOriginCoords=[lon,lat];
          if(!this._lastReroute || Date.now()-this._lastReroute>12000){
            this._lastReroute=Date.now();
            API.getRoute([lon,lat], dest, {scenario:this.currentScenario, horizon:this.currentHorizon}).then(data=>{
              if(data.routes && data.routes.length){
                this.lastRoutes=data.routes;
                window._lastRoutes=data.routes;
                const rec=data.routes.find(r=>r.is_recommended)||data.routes[0];
                document.getElementById('route-eta').textContent=formatDuration(rec.eta_minutes);
                if(typeof updateRouteSources==='function') updateRouteSources(data.routes, rec.id);
                API.getTrafficSegments(rec.geometry, {scenario:this.currentScenario, horizon:this.currentHorizon, origin:[lon,lat], destination:dest}).then(fc=>{
                  window._lastTraffic=fc; this.lastTraffic=fc;
                  if(map && map.getSource('traffic-segments')) map.getSource('traffic-segments').setData(fc);
                });
              }
            });
          }
        }
        if(map) map.panTo([lon,lat], {duration:900});
      }
    };
    const onErr=(err)=>{
      if(err.message && err.message.includes('Only secure origins')){
        toast('Live GPS blocked: use HTTPS or localhost');
        this.stopLiveNavigation();
      } else if(err.code===1){
        toast('Location permission denied — allow to navigate');
        this.stopLiveNavigation();
      }
    };
    window.liveNavWatch=navigator.geolocation.watchPosition(onPos, onErr, {enableHighAccuracy:true, maximumAge:2000, timeout:10000});
    this._lastNavPos=null; this._lastReroute=0;
  },
  stopLiveNavigation(){
    window.isNavigating=false;
    const btn=document.getElementById('btn-start-nav');
    if(btn){ btn.textContent='Start'; btn.style.background=''; }
    if(window.liveNavWatch!==null){ navigator.geolocation.clearWatch(window.liveNavWatch); window.liveNavWatch=null; }
    if(typeof clearLiveNav==='function') clearLiveNav();
    toast('Navigation stopped');
  },
  _haversine(lon1, lat1, lon2, lat2){
    const R=6371; const dlat=(lat2-lat1)*Math.PI/180; const dlon=(lon2-lon1)*Math.PI/180;
    const a=Math.sin(dlat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dlon/2)**2;
    return 2*R*Math.asin(Math.sqrt(a));
  },

  async loadWeather(){
    try{
      // Use map center or my location if available
      let lat=12.9716, lon=77.5946;
      if(currentOriginCoords) { lon=currentOriginCoords[0]; lat=currentOriginCoords[1];}
      else if(navigator.geolocation){
        // try quick cached?
      }
      const w=await API.weather(lat,lon);
      const el=document.getElementById('weather-widget');
      const txt=document.getElementById('weather-text');
      const icon=document.getElementById('weather-icon');
      el.classList.remove('hidden');
      txt.textContent=`${w.description} • ${w.temperature ?? '--'}°C ${w.is_rain? '• Rain '+w.rain_mm+'mm':''}`;
      icon.textContent= w.is_rain?'🌧':'☀';
      // Store for route use? backend already fetches weather per route, but we show to user
      window._currentWeather=w;
    }catch{}
  },

  async setMode(mode, btn){
    this.isCityMode=(mode==='city');
    document.getElementById('mode-driver').classList.remove('active');
    document.getElementById('mode-city').classList.remove('active');
    btn.classList.add('active');
    if(this.isCityMode){
      document.getElementById('city-panel').classList.remove('hidden');
      await this.refreshCityInsights();
    } else document.getElementById('city-panel').classList.add('hidden');
  },

  async refreshCityInsights(){
    const geom=this.lastRoutes ? (this.lastRoutes.find(r=>r.is_recommended)||this.lastRoutes[0]).geometry : null;
    const data=await API.getInsights(geom, {scenario:this.currentScenario, horizon:this.currentHorizon});
    const container=document.getElementById('insights-container');
    if(!data.insights||!data.insights.length){container.innerHTML='<p style="color:var(--text-muted);font-size:13px">No insights yet — select a route.</p>';return;}
    container.innerHTML=data.insights.map(i=>`
      <div class="insight-item ${i.level==='HIGH'?'high': i.level==='MEDIUM'?'medium':'low'}">
        <h4>${i.title}</h4><p>${i.detail}</p>
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px"><strong>Location:</strong> ${i.location}</div>
        <div style="font-size:11px;color:var(--text-muted)"><strong>Prediction:</strong> ${i.prediction}</div>
        <p class="action">↳ ${i.recommendation}</p>
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px"><strong>Reason:</strong> ${i.reason}</div>
        <div style="font-size:11px;color:#065f46;background:#ecfdf5;padding:4px 8px;border-radius:999px;margin-top:6px; display:inline-block">Est. impact: ${i.impact}</div>
      </div>`).join('');
    if(document.getElementById('layer-risk').checked) this.updateRiskPoints(this.lastTraffic);
  },

  showRoutePanel(routes){
    this.lastRoutes=routes; window._lastRoutes=routes;
    document.getElementById('route-panel').classList.remove('hidden');
    const rec=routes.find(r=>r.is_recommended)||routes[0];
    this.selectedRouteId=rec.id; window._selectedRouteId=rec.id;
    document.getElementById('route-title').innerText=rec.name.replace('FLOW','Flow');
    document.getElementById('route-eta').innerText=formatDuration(rec.eta_minutes);
    document.getElementById('route-distance').innerText=rec.distance_km+" km • "+rec.reason;
    document.getElementById('route-reason').innerText=rec.reason;
    // Weather on route
    if(routes[0].weather || window._lastWeather){
      const w=routes[0].weather||window._currentWeather;
      if(w){
        const we=document.getElementById('weather-on-route');
        we.classList.remove('hidden');
        we.textContent = w.is_rain ? `🌧 Rain expected: ${w.description} • Rainfall model ${w.rainfall_for_model?.toFixed(0)} — expect slower speeds` : `☀ ${w.description} • Clear for this route`;
      }
    }
    // Eco metrics
    let ecoHtml='';
    if(rec.eco){
      const e=rec.eco;
      ecoHtml=`<div style="font-size:11px;color:var(--text-muted);margin-top:4px">⛽ ${e.fuel_litres}L • CO₂ ${e.co2_kg}kg • ${e.avg_speed_kmh}km/h avg • <span class="eco-badge ${e.badge?'both':''}">${e.pollution_label}</span></div>`;
    }
    // Impact
    if(routes.length>1){
      const alts=routes.filter(r=> r.id!==rec.id);
      const worstAlt=alts.reduce((a,b)=> a.eta_minutes > b.eta_minutes ? a : b, alts[0]);
      const saved=Math.max(0, worstAlt.eta_minutes - rec.eta_minutes);
      const fuel=(saved*0.04).toFixed(1);
      const worstScore=Math.max(...alts.map(r=> r.ai.avg_score));
      const scoreSaved=(worstScore - rec.ai.avg_score).toFixed(1);
      const msg=saved>0? `${formatDuration(saved)} & ${fuel}L saved vs ${worstAlt.name.replace('FLOW','Flow')}` : `Avoids ${scoreSaved} pts congestion vs ${worstAlt.name.replace('FLOW','Flow')}`;
      document.getElementById('impact-metrics').innerHTML=`Prototype est: ${msg} • AI ${(100 - rec.ai.avg_score*0.32).toFixed(0)}% ${ecoHtml}`;
    } else {
      document.getElementById('impact-metrics').innerHTML=`AI optimized • Avg congestion ${rec.ai.avg_score} ${ecoHtml}`;
    }
    const alts=document.getElementById('alternative-routes-container');
    alts.innerHTML=routes.filter(r=>r.id!==rec.id).slice(0,3).map(r=>{
      const eco=r.eco ? `<br><small>⛽ ${r.eco.fuel_litres}L • CO₂ ${r.eco.co2_kg}kg • ${r.eco.pollution_label}${r.eco.badge?` • <span class="eco-badge ${r.eco.badge==='Most Eco-Friendly'?'both': r.eco.badge==='Fuel Efficient'?'fuel':'emission'}">${r.eco.badge}</span>`:''}</small>` : '';
      return `<div class="alt-route" data-id="${r.id}"><h4>${r.name.replace('FLOW','Flow')} • ${formatDuration(r.eta_minutes)} · ${r.distance_km} km ${r.eco?.badge?`<span class="eco-badge ${r.eco.badge==='Most Eco-Friendly'?'both': r.eco.badge==='Fuel Efficient'?'fuel':'emission'}">${r.eco.badge}</span>`:''}</h4><p>${r.ai.max_category} • Score ${r.ai.avg_score} • ${r.reason}${eco}</p></div>`;
    }).join('') || '<p style="font-size:12px;color:var(--text-muted)">No alternative within 10 min buffer — this is the optimal road-following route.</p>';
    alts.querySelectorAll('.alt-route').forEach(el=>{el.onclick=()=> this.selectRoute(el.dataset.id);});
    updateRouteSources(routes, rec.id);
    this.maybeShowAlert(this.lastTraffic);
    if(this.isCityMode) this.refreshCityInsights();
    // Save weather for later
    if(routes[0].weather) window._lastWeather=routes[0].weather;
  },

  selectRoute(routeId){
    this.selectedRouteId=routeId; window._selectedRouteId=routeId;
    const selected=this.lastRoutes.find(r=>r.id===routeId); if(!selected) return;
    document.getElementById('route-title').innerText=selected.name.replace('FLOW','Flow');
    document.getElementById('route-eta').innerText=formatDuration(selected.eta_minutes);
    document.getElementById('route-distance').innerText=selected.distance_km+" km • "+selected.reason;
    document.getElementById('route-reason').innerText=selected.reason;
    document.querySelectorAll('.alt-route').forEach(el=> el.classList.toggle('active', el.dataset.id===routeId));
    updateRouteSources(this.lastRoutes, routeId);
    this.refreshTrafficForGeometry(selected.geometry);
  },

  async refreshTraffic(){
    if(!this.lastRoutes) return;
    const geom=(this.lastRoutes.find(r=> r.id===this.selectedRouteId)||this.lastRoutes[0]).geometry;
    await this.refreshTrafficForGeometry(geom);
    if(this.isCityMode) await this.refreshCityInsights();
  },

  async refreshTrafficForGeometry(geometry){
    const showTraffic=document.getElementById('layer-traffic').checked;
    const horizon=document.getElementById('layer-forecast').checked ? this.currentHorizon : 'now';
    const scenario=this.currentScenario;
    // include origin/dest for weather context
    const fc=await API.getTrafficSegments(geometry, {scenario, horizon, origin: currentOriginCoords, destination: currentDestCoords});
    window._lastTraffic=fc; this.lastTraffic=fc;
    if(map && map.getSource('traffic-segments')) map.getSource('traffic-segments').setData(fc);
    setTrafficVisibility(showTraffic, document.getElementById('layer-risk').checked);
    if(document.getElementById('layer-risk').checked) this.updateRiskPoints(fc);
    this.maybeShowAlert(fc);
  },

  toggleRisk(show){
    setTrafficVisibility(document.getElementById('layer-traffic').checked, show);
    if(show && this.lastTraffic) this.updateRiskPoints(this.lastTraffic);
    else if(map && map.getSource('risk-points')) map.getSource('risk-points').setData({type:'FeatureCollection',features:[]});
  },
  updateRiskPoints(fc){
    if(!fc||!fc.features) return;
    const pts=fc.features.filter(f=> ['High','Severe'].includes(f.properties.category)).map(f=>{
      const c=f.geometry.coordinates; const mid=c[Math.floor(c.length/2)];
      return {type:'Feature', geometry:{type:'Point', coordinates:mid}, properties:{category:f.properties.category, show:true}};
    });
    if(map.getSource('risk-points')) map.getSource('risk-points').setData({type:'FeatureCollection', features: pts});
  },
  maybeShowAlert(fc){
    if(!fc||!fc.features){document.getElementById('ai-alert').classList.add('hidden'); return;}
    const worst=fc.features.reduce((a,b)=> a.properties.score > b.properties.score ? a : b);
    if(['High','Severe'].includes(worst.properties.category) && worst.properties.risk_probability > 60){
      document.getElementById('ai-alert').classList.remove('hidden');
      document.getElementById('alert-desc').innerText=`${worst.properties.risk_probability}% ${worst.properties.category.toLowerCase()} on ${worst.properties.road_name} (${worst.properties.start_point} → ${worst.properties.end_point}) within 30 min.`;
    } else document.getElementById('ai-alert').classList.add('hidden');
  },

  showInsightCard(props){
    document.getElementById('insight-card').classList.remove('hidden');
    document.getElementById('seg-start').innerText=props.start_point||'Origin';
    document.getElementById('seg-end').innerText=props.end_point||'Destination';
    document.getElementById('insight-road').innerText=props.road_name||'Bengaluru Road';
    document.getElementById('insight-category').innerText=props.category+' Traffic';
    document.getElementById('seg-risk').innerText=(props.risk_probability||props.score||'--') + (typeof props.risk_probability==='number'?'%':'');
    document.getElementById('seg-speed').innerText=(props.average_speed||'--')+' km/h';
    document.getElementById('insight-current').innerText=props.category+' traffic';
    const dot=document.getElementById('insight-dot');
    const cm={Low:'#16a34a',Moderate:'#eab308',High:'#f97316',Severe:'#dc2626'};
    dot.style.background=cm[props.category]||'#f97316';
    const ft=props.category==='Severe'?'Worsen within 10 min.': props.category==='High'?'Worsen within 20 min.': props.category==='Moderate'?'Stable.':'Flowing.';
    document.getElementById('insight-forecast').innerText=ft;
    document.getElementById('insight-desc').innerText=`Flow AI: ${ft} Vehicle ${props.vehicle_count||'--'}, speed ${props.average_speed||'--'} km/h.`;
  },

  async runSimulation(){
    const traffic=document.getElementById('sim-traffic').value;
    const weather=document.getElementById('sim-weather').value;
    const event=document.getElementById('sim-event').value;
    let scenario='normal';
    if(traffic==='very_high') scenario='very_high';
    else if(traffic==='high') scenario='high_traffic';
    else if(weather==='rain') scenario='rain';
    if(event==='road_closure') scenario='closure';
    else if(event==='major_event') scenario='event';
    this.currentScenario=scenario;
    const simRes=await API.simulate({traffic, weather, event});
    document.getElementById('sim-result').classList.remove('hidden');
    document.getElementById('sim-result').innerHTML=`<div><strong>${simRes.prediction.category}</strong> • Score ${simRes.prediction.score} • Risk ${simRes.prediction.risk_probability}%</div><div style="margin-top:4px">Before: ${this.lastTraffic ? (this.lastTraffic.features.reduce((a,b)=>a+b.properties.score,0)/this.lastTraffic.features.length).toFixed(1):'--'} → After: ${simRes.prediction.score}</div><div style="margin-top:4px;color:var(--text-soft)">${simRes.summary} • Vehicle ${simRes.features.vehicle_count}, Speed ${simRes.features.average_speed} km/h</div>`;
    toast(`Simulation: ${simRes.prediction.category}`);
    if(this.lastRoutes){
      const geom=(this.lastRoutes.find(r=>r.id===this.selectedRouteId)||this.lastRoutes[0]).geometry;
      await this.refreshTrafficForGeometry(geom);
      if(currentOriginCoords&&currentDestCoords){
        const data=await API.getRoute(currentOriginCoords, currentDestCoords, {scenario, horizon:this.currentHorizon});
        if(data.routes&&data.routes.length){
          this.showRoutePanel(data.routes);
          const recGeom=data.routes.find(r=>r.is_recommended).geometry;
          await this.refreshTrafficForGeometry(recGeom);
        }
      }
    } else if(this.isCityMode) this.refreshCityInsights();
  },

  refreshSavedList(){
    const all=getAllSaved();
    const container=document.getElementById('saved-places-list');
    if(!Object.keys(all).length){container.innerHTML='<div style="font-size:12px;color:var(--text-muted);padding:8px">No saved places yet.</div>';return;}
    container.innerHTML=Object.entries(all).map(([k,v])=>`<div class="saved-item"><div><strong>${k}</strong><br><small>${v.name}</small></div><button data-k="${k}" class="use-saved">Use</button></div>`).join('');
    container.querySelectorAll('.use-saved').forEach(b=>{
      b.onclick=()=>{
        const v=all[b.dataset.k];
        if(v&&v.coords){ currentDestCoords=v.coords; document.getElementById('dest-input').value=v.name; clearMarkers(); if(currentOriginCoords) addMarker(currentOriginCoords,'origin'); addMarker(v.coords,'dest'); if(map) map.flyTo({center:v.coords, zoom:13});}
      };
    });
  },

  initFirebase(){
    if(!window._FLOW_AUTH) return;
    try{
      const auth=window._FLOW_AUTH.getAuth();
      window._FLOW_AUTH.onAuthStateChanged(auth, (user)=>{
        if(user){
          document.getElementById('profile-name').innerText=user.displayName||user.email.split('@')[0];
          document.getElementById('pm-name').innerText=user.displayName||'Signed in';
          document.getElementById('pm-email').innerText=user.email;
        }
      });
    }catch(e){console.log(e);}
  }
};

function toast(msg){
  const t=document.getElementById('toast'); t.innerText=msg; t.classList.remove('hidden'); setTimeout(()=> t.classList.add('hidden'), 3000);
}
