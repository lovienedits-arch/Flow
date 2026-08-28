document.addEventListener('DOMContentLoaded', async ()=>{
  await initMap();
  setupSearch();
  UI.setupInteractions();

  document.getElementById('btn-route').onclick = async ()=>{
    // Allow either dropdown select or free text: if coords missing but input has text, try to geocode now
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
        toast('Set starting point (type, tap ◎, or click map)');
        return;
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
        UI.showRoutePanel(data.routes);
        const rec=data.routes.find(r=>r.is_recommended)||data.routes[0];
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
