document.addEventListener('DOMContentLoaded', async ()=>{
  await initMap();
  setupSearch();
  UI.setupInteractions();

  document.getElementById('btn-route').onclick = async ()=>{
    // Google Maps-style: if origin empty, use live location
    if(!currentOriginCoords){
      const q=document.getElementById('origin-input').value.trim();
      if(q){
        const data=await API.geocode(q);
        if(data.results && data.results.length){
          currentOriginCoords=data.results[0].coordinates;
          currentOriginName=data.results[0].name;
          addMarker(currentOriginCoords,'origin');
        } else {
          toast('Could not find starting point — pick from dropdown or map');
          return;
        }
      } else {
        // No origin typed — try live location like Google Maps
        if(navigator.geolocation && window.isSecureContext!==false){
          toast('Using your live location as start…');
          try{
            const pos=await new Promise((resolve, reject)=>{
              navigator.geolocation.getCurrentPosition(resolve, reject, {enableHighAccuracy:true, timeout:8000});
            });
            currentOriginCoords=[pos.coords.longitude, pos.coords.latitude];
            originIsLiveLocation=true;
            document.getElementById('origin-input').value='My live location';
            addMarker(currentOriginCoords,'origin');
            if(map) map.flyTo({center:currentOriginCoords, zoom:14});
          }catch(err){
            let msg=err.message||'';
            if(msg.includes('Only secure origins') || !window.isSecureContext){
              toast('Live location needs HTTPS — please type origin or tap map');
            } else {
              toast('Could not get live location — please type origin or tap map');
            }
            return;
          }
        } else {
          toast('Set starting point (type, tap ◎, or click map) — or allow location');
          return;
        }
      }
    }
    if(!currentDestCoords){
      const q=document.getElementById('dest-input').value.trim();
      if(q){
        const data=await API.geocode(q);
        if(data.results && data.results.length){
          currentDestCoords=data.results[0].coordinates;
          currentDestName=data.results[0].name;
          addMarker(currentDestCoords,'dest');
        } else {
          toast('Could not find destination');
          return;
        }
      } else {toast('Set destination'); return;}
    }

    document.getElementById('btn-route').innerText='Finding…';
    try{
      const data=await API.getRoute(currentOriginCoords, currentDestCoords, {scenario:UI.currentScenario, horizon:UI.currentHorizon});
      if(data.routes && data.routes.length){
        if(data.weather) window._lastWeather=data.weather;
        // If carpool trip toggle is checked, show FlowPool first for details before normal route
        const carpoolToggle=document.getElementById('carpool-trip-toggle');
        const isCarpoolTrip = carpoolToggle && carpoolToggle.checked;
        if(isCarpoolTrip){
          // Ensure FlowPool widget is visible and on Host tab
          const widget=document.getElementById('flowpool-widget');
          if(widget) widget.classList.remove('hidden');
          document.querySelectorAll('#flowpool-tabs button').forEach(b=>b.classList.remove('active'));
          const hostTab=document.querySelector('#flowpool-tabs button[data-tab="offer"]');
          if(hostTab) hostTab.classList.add('active');
          document.getElementById('flowpool-find').classList.add('hidden');
          document.getElementById('flowpool-offer').classList.remove('hidden');
          // Scroll to FlowPool for details
          widget?.scrollIntoView({behavior:'smooth', block:'center'});
          toast('Carpool selected — host your pool to share ride');
          // Still show route but keep carpool prominent
        }
        UI.showRoutePanel(data.routes);
        // FlowPool and carpool suggestion only if carpool trip is selected — otherwise neat navigation
        const isCarpool = document.getElementById('carpool-trip-toggle')?.checked;
        if(isCarpool){
          if(typeof UI.refreshFlowPoolFind==='function') setTimeout(()=> UI.refreshFlowPoolFind(), 300);
          if(data.carpool) UI.showCarpoolSuggestion(data.carpool);
          else {
            API.carpoolSearch(currentOriginCoords, currentDestCoords).then(r=>{ if(r.matches) UI.showCarpoolSuggestion(r.matches); }).catch(()=>{});
          }
        } else {
          // Hide carpool suggestion for neat navigation
          const cs=document.getElementById('carpool-suggestion');
          if(cs) cs.classList.add('hidden');
        }
        const rec=data.routes.find(r=>r.is_recommended)||data.routes[0];
        // If origin was live location, auto-start live navigation like Google Maps
        if(typeof originIsLiveLocation !== 'undefined' && originIsLiveLocation){
          setTimeout(()=>{
            // Highlight that live navigation is available
            const startBtn=document.getElementById('btn-start-nav');
            if(startBtn){
              startBtn.textContent='▶ Start Live Navigation';
              startBtn.style.background='#16a34a';
              // Auto-start after short delay if user is on mobile or has granted
              if(navigator.geolocation && window.isSecureContext!==false){
                toast('Live location ready — tap Start to navigate live');
              }
            }
          }, 400);
        }
        // Weather widget update for route
        if(data.weather){
          window._currentWeather=data.weather.details?.origin || {description:data.weather.description, is_rain:data.weather.is_rain};
          UI.loadWeather();
        }
        const traffic=await API.getTrafficSegments(rec.geometry, {scenario:UI.currentScenario, horizon:UI.currentHorizon, origin: currentOriginCoords, destination: currentDestCoords});
        window._lastTraffic=traffic; UI.lastTraffic=traffic;
        if(map.getSource('traffic-segments')) map.getSource('traffic-segments').setData(traffic);
        setTrafficVisibility(document.getElementById('layer-traffic').checked, document.getElementById('layer-risk').checked);
        if(document.getElementById('layer-risk').checked) UI.updateRiskPoints(traffic);
        UI.maybeShowAlert(traffic);
        if(UI.isCityMode) UI.refreshCityInsights();
      } else toast(data.error||'No routes found');
    }catch(e){toast('Route failed: '+e.message);}
    finally{document.getElementById('btn-route').innerText='Navigate →';}
  };

  // Auto-locate on first open if guest and no origin? prompt but not forced
  // If we have previously shared location, try to prefill?
});

async function useMyLocationForRoute(){
  // helper for external call
}
