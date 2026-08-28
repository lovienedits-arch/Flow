let currentOriginCoords = null;
let currentDestCoords = null;
let currentOriginName = "";
let currentDestName = "";

function setupSearch(){
  setupInput('origin-input','origin-results',(coords,name,display)=>{
    currentOriginCoords=coords; currentOriginName=name;
    document.getElementById('origin-input').value=display||name;
    addMarker(coords,'origin'); if(map) map.flyTo({center:coords, zoom:14, duration:900});
  });
  setupInput('dest-input','dest-results',(coords,name,display)=>{
    currentDestCoords=coords; currentDestName=name;
    document.getElementById('dest-input').value=display||name;
    addMarker(coords,'dest'); if(map) map.flyTo({center:coords, zoom:14, duration:900});
  });

  document.getElementById('btn-swap').onclick = ()=>{
    [currentOriginCoords,currentDestCoords]=[currentDestCoords,currentOriginCoords];
    [currentOriginName,currentDestName]=[currentDestName,currentOriginName];
    const o=document.getElementById('origin-input').value;
    const d=document.getElementById('dest-input').value;
    document.getElementById('origin-input').value=d;
    document.getElementById('dest-input').value=o;
    clearMarkers();
    if(currentOriginCoords) addMarker(currentOriginCoords,'origin');
    if(currentDestCoords) addMarker(currentDestCoords,'dest');
    if(currentOriginCoords&&currentDestCoords) document.getElementById('btn-route').click();
  };

  // Clear buttons
  document.querySelectorAll('.clear-btn').forEach(b=>{
    b.onclick=()=>{
      const id=b.dataset.clear;
      document.getElementById(id).value='';
      if(id==='origin-input'){currentOriginCoords=null;currentOriginName='';}
      else {currentDestCoords=null;currentDestName='';}
      clearMarkers();
      if(currentOriginCoords) addMarker(currentOriginCoords,'origin');
      if(currentDestCoords) addMarker(currentDestCoords,'dest');
    };
  });

  // Use my location buttons
  document.getElementById('btn-my-loc-origin').onclick = ()=> useMyLocation('origin');
  document.getElementById('btn-locate-header').onclick = ()=> useMyLocation('origin');
  document.getElementById('btn-pick-origin').onclick = ()=> applyPicked('origin');
  document.getElementById('btn-pick-dest').onclick = ()=> applyPicked('dest');

  // Map pick via double? Already handled via map click sets pickedCoords
  // Allow typing any place without dropdown: on Enter, geocode first result and set
  ['origin-input','dest-input'].forEach(id=>{
    document.getElementById(id).addEventListener('keydown', async (e)=>{
      if(e.key==='Enter'){
        e.preventDefault();
        const q=e.target.value.trim();
        if(!q) return;
        // If dropdown visible and first item exists, click it; else geocode
        const resultsId = id==='origin-input'?'origin-results':'dest-results';
        const first=document.querySelector(`#${resultsId} .autocomplete-item`);
        if(first){first.click(); return;}
        // Fallback: geocode and take first
        const data=await API.geocode(q);
        if(data.results && data.results.length){
          const p=data.results[0];
          if(id==='origin-input'){
            currentOriginCoords=p.coordinates; document.getElementById('origin-input').value=p.display_name||p.name;
            addMarker(p.coordinates,'origin'); if(map) map.flyTo({center:p.coordinates, zoom:13});
          } else {
            currentDestCoords=p.coordinates; document.getElementById('dest-input').value=p.display_name||p.name;
            addMarker(p.coordinates,'dest'); if(map) map.flyTo({center:p.coordinates, zoom:13});
          }
        } else {
          // Try interpreting as lat,lon
          try{
            const parts=q.split(',');
            if(parts.length===2){
              const lat=parseFloat(parts[0]), lon=parseFloat(parts[1]);
              if(!isNaN(lat)&&!isNaN(lon)){
                const coords=[lon,lat];
                if(id==='origin-input'){currentOriginCoords=coords; addMarker(coords,'origin');}
                else {currentDestCoords=coords; addMarker(coords,'dest');}
                if(map) map.flyTo({center:coords, zoom:14});
              }
            }
          }catch{}
        }
      }
    });
  });

  // Saved chips
  document.querySelectorAll('.chip').forEach(ch=>{
    ch.onclick=()=>{
      const place=ch.dataset.place;
      if(place==='home'||place==='work'){
        const saved=getSavedPlace(place);
        if(saved){
          if(!currentDestCoords||!currentOriginCoords){
            // If origin empty, fill origin else dest
            if(!currentOriginCoords){currentOriginCoords=saved.coords; document.getElementById('origin-input').value=saved.name; addMarker(saved.coords,'origin');}
            else {currentDestCoords=saved.coords; document.getElementById('dest-input').value=saved.name; addMarker(saved.coords,'dest');}
          } else { // both filled, overwrite dest
            currentDestCoords=saved.coords; document.getElementById('dest-input').value=saved.name; addMarker(saved.coords,'dest');
          }
          if(map) map.flyTo({center:saved.coords, zoom:13});
        } else {toast(`Set ${place} in Saved Places`); document.getElementById('profile-btn').click();}
      } else if(ch.hasAttribute('data-save')){
        const name=prompt('Save current destination as (Home/Work/Custom):','Custom');
        if(!name) return;
        const coords=currentDestCoords||currentOriginCoords;
        if(!coords) return toast('Select a place first');
        const key=name.toLowerCase().includes('home')?'home': name.toLowerCase().includes('work')?'work': name;
        savePlace(key,{name, coords}); toast(`Saved ${name}`); UI.refreshSavedList();
      }
    };
  });
}

function setupInput(inputId, resultsId, onSelect){
  const input=document.getElementById(inputId);
  const results=document.getElementById(resultsId);
  let timeout=null;
  input.addEventListener('input', (e)=>{
    clearTimeout(timeout);
    const q=e.target.value.trim();
    if(q.length<2){results.classList.add('hidden'); results.innerHTML=''; return;}
    timeout=setTimeout(async ()=>{
      const data=await API.geocode(q);
      results.innerHTML='';
      if(data.results && data.results.length){
        data.results.forEach(place=>{
          const div=document.createElement('div');
          div.className='autocomplete-item';
          div.innerHTML=`<div>${place.name}</div><div class="sub">${place.display_name}</div>`;
          div.onclick=()=>{onSelect(place.coordinates, place.name, place.display_name); results.classList.add('hidden');};
          results.appendChild(div);
        });
        results.classList.remove('hidden');
      } else {results.classList.add('hidden');}
    },260);
  });
  input.addEventListener('focus', ()=>{ if(results.children.length) results.classList.remove('hidden'); });
  document.addEventListener('click',(e)=>{ if(!input.contains(e.target)&&!results.contains(e.target)) results.classList.add('hidden'); });
}

function useMyLocation(target){
  if(!navigator.geolocation){toast('Geolocation not available — click map or type address'); return;}
  if(window.isSecureContext===false){
    toast('Location needs HTTPS — please use map tap or search instead. Tip: open as https://localhost or use Chrome localhost.');
    // highlight manual fallback
    document.getElementById('origin-input')?.focus();
    return;
  }
  toast('Locating…');
  navigator.geolocation.getCurrentPosition(async pos=>{
    const coords=[pos.coords.longitude, pos.coords.latitude];
    const rev=await API.reverse(pos.coords.latitude, pos.coords.longitude);
    const name=rev.display_name||`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
    if(target==='origin'){
      currentOriginCoords=coords; currentOriginName=name;
      document.getElementById('origin-input').value=name.split(',').slice(0,3).join(',');
      addMarker(coords,'origin');
    } else {
      currentDestCoords=coords; currentDestName=name;
      document.getElementById('dest-input').value=name.split(',').slice(0,3).join(',');
      addMarker(coords,'dest');
    }
    if(map) map.flyTo({center:coords, zoom:15});
    toast('Location set');
  }, async err=>{
    let msg=err.message||'';
    if(msg.includes('Only secure origins') || !window.isSecureContext){
      toast('HTTPS required for precise GPS — trying approximate location…');
      // IP fallback as secure-origin workaround
      try{
        const r=await fetch('https://ipapi.co/json/').then(x=>x.json());
        if(r.latitude && r.longitude){
          const coords=[r.longitude, r.latitude];
          const name=r.city? `${r.city}, ${r.region}` : `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}`;
          if(target==='origin'){
            currentOriginCoords=coords; currentOriginName=name;
            document.getElementById('origin-input').value=name;
            addMarker(coords,'origin');
          } else {
            currentDestCoords=coords; currentDestName=name;
            document.getElementById('dest-input').value=name;
            addMarker(coords,'dest');
          }
          if(map) map.flyTo({center:coords, zoom:12});
          toast('Approximate location set — tap map for precise');
          return;
        }
      }catch(e){}
      toast('Tap map to set location, or type address in search');
    } else if(err.code===1){
      toast('Location permission denied — enable in browser or tap map to set manually');
    } else {
      toast('Location unavailable: '+msg+' — use map or search');
    }
  }, {enableHighAccuracy:true, timeout:8000, maximumAge:10000});
}

function applyPicked(target){
  if(!pickedCoords){toast('Click map first to pick a point'); return;}
  const [lon,lat]=pickedCoords;
  API.reverse(lat,lon).then(r=>{
    const name=r.display_name||`${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    if(target==='origin'){
      currentOriginCoords=[lon,lat]; document.getElementById('origin-input').value=name.split(',').slice(0,3).join(',');
      addMarker([lon,lat],'origin');
    } else {
      currentDestCoords=[lon,lat]; document.getElementById('dest-input').value=name.split(',').slice(0,3).join(',');
      addMarker([lon,lat],'dest');
    }
    if(map) map.flyTo({center:[lon,lat], zoom:14});
  });
}

function getSavedPlace(key){
  try{const raw=localStorage.getItem('flow-saved-'+key); if(raw) return JSON.parse(raw);}catch{}
  return null;
}
function savePlace(key,val){
  localStorage.setItem('flow-saved-'+key, JSON.stringify(val));
}
function getAllSaved(){
  const out={};
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(k&&k.startsWith('flow-saved-')) try{out[k.replace('flow-saved-','')]=JSON.parse(localStorage.getItem(k))}catch{}
  }
  return out;
}
