const API = {
  _token: () => localStorage.getItem('flow_token') || '',
  _headers: () => {
    const h = {'Content-Type':'application/json'};
    const t = localStorage.getItem('flow_token');
    if(t) h['Authorization'] = 'Bearer ' + t;
    return h;
  },
  getConfig: async () => (await fetch('/api/config')).json(),
  geocode: async (q) => (await fetch(`/api/geocode?q=${encodeURIComponent(q)}`)).json(),
  reverse: async (lat, lon) => (await fetch(`/api/reverse?lat=${lat}&lon=${lon}`)).json(),
  getRoute: async (origin, dest, opts={}) => {
    const body = { origin, destination: dest, scenario: opts.scenario||'normal', horizon: opts.horizon||'now' };
    const res = await fetch('/api/route', { method:'POST', headers: API._headers(), body: JSON.stringify(body)});
    return res.json();
  },
  getTrafficSegments: async (geometry, opts={}) => {
    const body = { geometry, scenario: opts.scenario||'normal', horizon: opts.horizon||'now', origin: opts.origin, destination: opts.destination };
    const res = await fetch('/api/traffic/segments', { method:'POST', headers: API._headers(), body: JSON.stringify(body)});
    return res.json();
  },
  getForecast: async (geometry, scenario='normal') => {
    const res = await fetch('/api/traffic/forecast', { method:'POST', headers: API._headers(), body: JSON.stringify({geometry, scenario})});
    return res.json();
  },
  getInsights: async (geometry, opts={}) => {
    if (geometry) {
      const res = await fetch('/api/insights', { method:'POST', headers: API._headers(), body: JSON.stringify({geometry, scenario:opts.scenario||'normal', horizon:opts.horizon||'now'})});
      return res.json();
    }
    return (await fetch('/api/insights', {headers: API._headers()})).json();
  },
  simulate: async (payload) => (await fetch('/api/simulate', { method:'POST', headers: API._headers(), body: JSON.stringify(payload)})).json(),
  predict: async (features, horizon) => {
    const body = {...features}; if (horizon) body.horizon = horizon;
    return (await fetch('/api/predict', { method:'POST', headers: API._headers(), body: JSON.stringify(body)})).json();
  },
  // Auth
  register: async (username, password, display_name) => (await fetch('/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username,password,display_name})})).json(),
  login: async (username, password) => (await fetch('/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username,password})})).json(),
  me: async () => (await fetch('/api/auth/me', {headers: API._headers()})).json(),
  logout: async () => (await fetch('/api/auth/logout', {method:'POST', headers: API._headers()})).json(),
  searchUsers: async (q) => (await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {headers: API._headers()})).json(),
  // Track
  trackRequest: async (username) => (await fetch('/api/track/request', {method:'POST', headers: API._headers(), body: JSON.stringify({username})})).json(),
  trackRequests: async () => (await fetch('/api/track/requests', {headers: API._headers()})).json(),
  trackAction: async (id, action) => (await fetch(`/api/track/request/${id}/action`, {method:'POST', headers: API._headers(), body: JSON.stringify({action})})).json(),
  trackUpdate: async (lat, lon, accuracy) => (await fetch('/api/track/location/update', {method:'POST', headers: API._headers(), body: JSON.stringify({lat,lon,accuracy})})).json(),
  trackLocation: async (username) => (await fetch(`/api/track/location/${username}`, {headers: API._headers()})).json(),
  trackConnections: async () => (await fetch('/api/track/connections', {headers: API._headers()})).json(),
  trackLive: async () => (await fetch('/api/track/live', {headers: API._headers()})).json(),
  weather: async (lat, lon) => (await fetch(`/api/weather?lat=${lat}&lon=${lon}`)).json(),
  // Carpool
  carpoolProfile: async () => (await fetch('/api/carpool/profile', {headers: API._headers()})).json(),
  saveCarpoolProfile: async (data) => (await fetch('/api/carpool/profile', {method:'POST', headers: API._headers(), body: JSON.stringify(data)})).json(),
  carpoolOffers: async () => (await fetch('/api/carpool/offers', {headers: API._headers()})).json(),
  createCarpoolOffer: async (data) => (await fetch('/api/carpool/offer', {method:'POST', headers: API._headers(), body: JSON.stringify(data)})).json(),
  carpoolSearch: async (origin, dest, within=45) => (await fetch('/api/carpool/search', {method:'POST', headers: API._headers(), body: JSON.stringify({origin,dest,within_mins:within})})).json(),
  carpoolJoin: async (offer_id) => (await fetch('/api/carpool/join', {method:'POST', headers: API._headers(), body: JSON.stringify({offer_id})})).json(),
  carpoolLeave: async (offer_id) => (await fetch('/api/carpool/leave', {method:'POST', headers: API._headers(), body: JSON.stringify({offer_id})})).json(),
};
