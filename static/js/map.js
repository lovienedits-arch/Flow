let map;
let markers = [];
let currentRouteData = null;
let pickedCoords = null;
let trackMarkers = {};
let liveNavMarker = null;
window.liveNavWatch = null;
window.isNavigating = false;

async function initMap() {
  const config = await API.getConfig();
  const center = config.center || [77.5946, 12.9716];
  map = new maplibregl.Map({
    container: 'map',
    style: config.style,
    center: center,
    zoom: 12,
    attributionControl: false
  });
  map.addControl(new maplibregl.NavigationControl({showCompass:false}), 'bottom-right');
  map.addControl(new maplibregl.AttributionControl({compact:true}), 'bottom-right');
  window._flowMapConfig = config;

  map.on('load', () => {
    map.addSource('route-bg', { type:'geojson', data:{type:'FeatureCollection',features:[]}});
    map.addLayer({ id:'route-line-bg', type:'line', source:'route-bg', layout:{'line-join':'round','line-cap':'round'}, paint:{'line-color':'#9aa0a6','line-width':6,'line-opacity':0.35}});
    map.addSource('routes-alt', { type:'geojson', data:{type:'FeatureCollection',features:[]}});
    map.addLayer({ id:'alt-lines', type:'line', source:'routes-alt', layout:{'line-join':'round','line-cap':'round'}, paint:{'line-color':'#9aa0a6','line-width':4,'line-opacity':0.5,'line-dasharray':[2,2]}});
    map.addSource('route-main', { type:'geojson', data:{type:'FeatureCollection',features:[]}});
    map.addLayer({ id:'route-main-outline', type:'line', source:'route-main', layout:{'line-join':'round','line-cap':'round'}, paint:{'line-color':'#ffffff','line-width':8,'line-opacity':0.9}});
    map.addSource('traffic-segments', { type:'geojson', data:{type:'FeatureCollection',features:[]}});
    map.addLayer({ id:'traffic-lines', type:'line', source:'traffic-segments', layout:{'line-join':'round','line-cap':'round'}, paint:{'line-color':['get','color'],'line-width':6,'line-opacity':0.95}});
    map.addSource('traffic-highlight', { type:'geojson', data:{type:'FeatureCollection',features:[]}});
    map.addLayer({ id:'traffic-highlight-line', type:'line', source:'traffic-highlight', layout:{'line-join':'round','line-cap':'round'}, paint:{'line-color':'#0f6af0','line-width':8,'line-opacity':0.0}});
    map.addSource('risk-points', { type:'geojson', data:{type:'FeatureCollection',features:[]}});
    map.addLayer({ id:'risk-circles', type:'circle', source:'risk-points', paint:{'circle-radius':10,'circle-color':'#dc2626','circle-opacity':0.12}});
    // Family track — vivid dots with halo
    map.addSource('track-points', { type:'geojson', data:{type:'FeatureCollection',features:[]}});
    // outer halo faint
    map.addLayer({ id:'track-halo', type:'circle', source:'track-points', paint:{'circle-radius':18,'circle-color':'#ff3b30','circle-opacity':0.18,'circle-stroke-width':0}});
    // inner solid dot — bright, not faint
    map.addLayer({ id:'track-circles', type:'circle', source:'track-points', paint:{'circle-radius':10,'circle-color':'#ff3b30','circle-opacity':0.95,'circle-stroke-width':3,'circle-stroke-color':'#ffffff'}});
    map.addLayer({ id:'track-labels', type:'symbol', source:'track-points', layout:{'text-field':['get','username'],'text-size':12,'text-offset':[0,1.7],'text-anchor':'top','text-font':['Open Sans Bold']}, paint:{'text-color':'#ff3b30','text-halo-color':'#ffffff','text-halo-width':1.2}});

    // Live navigation dot (pulsing blue)
    map.addSource('live-nav', { type:'geojson', data:{type:'FeatureCollection',features:[]}});
    map.addLayer({ id:'live-nav-halo', type:'circle', source:'live-nav', paint:{'circle-radius':18,'circle-color':'#0f6af0','circle-opacity':0.18}});
    map.addLayer({ id:'live-nav-dot', type:'circle', source:'live-nav', paint:{'circle-radius':8,'circle-color':'#0f6af0','circle-opacity':1,'circle-stroke-width':3,'circle-stroke-color':'#ffffff'}});

    map.on('click','traffic-lines', (e)=>{
      const feat = e.features[0];
      UI.showInsightCard(feat.properties, feat.geometry);
      map.getSource('traffic-highlight').setData({type:'FeatureCollection',features:[feat]});
      map.setPaintProperty('traffic-highlight-line','line-opacity',0.35);
    });
    map.on('mouseenter','traffic-lines',()=> map.getCanvas().style.cursor='pointer');
    map.on('mouseleave','traffic-lines',()=> map.getCanvas().style.cursor='');

    // Family dot click -> navigate popup
    map.on('click','track-circles', (e)=>{
      const feat=e.features[0];
      const username=feat.properties.username;
      const coords=feat.geometry.coordinates.slice();
      const popupHtml=`<div style="min-width:160px;text-align:center"><strong style="color:#ff3b30">${username}</strong><br><small>Family • Live</small><br><button id="popup-navigate" style="margin-top:8px;background:#ff3b30;color:#fff;border:none;padding:8px 14px;border-radius:999px;font-weight:600;cursor:pointer">Navigate →</button></div>`;
      const popup=new maplibregl.Popup({closeOnClick:true}).setLngLat(coords).setHTML(popupHtml).addTo(map);
      setTimeout(()=>{
        const btn=document.getElementById('popup-navigate');
        if(btn) btn.onclick=()=>{
          popup.remove();
          // set destination to family member, use my location as origin if available
          if(!currentOriginCoords && navigator.geolocation){
            toast('Using your location as start…');
            navigator.geolocation.getCurrentPosition(pos=>{
              currentOriginCoords=[pos.coords.longitude,pos.coords.latitude];
              document.getElementById('origin-input').value='My location';
              addMarker(currentOriginCoords,'origin');
              currentDestCoords=coords;
              document.getElementById('dest-input').value=username+' (family)';
              addMarker(coords,'dest');
              document.getElementById('btn-route').click();
              setTimeout(()=> UI.startLiveNavigation(), 1800);
            }, ()=>{
              currentDestCoords=coords;
              document.getElementById('dest-input').value=username;
              addMarker(coords,'dest');
              toast('Set destination to '+username+' — set origin to start navigation');
            }, {enableHighAccuracy:true, timeout:6000});
          } else {
            currentDestCoords=coords;
            document.getElementById('dest-input').value=username+' (family)';
            addMarker(coords,'dest');
            document.getElementById('btn-route').click();
          }
        };
      }, 80);
    });
    map.on('mouseenter','track-circles',()=> map.getCanvas().style.cursor='pointer');
    map.on('mouseleave','track-circles',()=> map.getCanvas().style.cursor='');
    map.on('mouseenter','track-halo',()=> map.getCanvas().style.cursor='pointer');
    map.on('mouseleave','track-halo',()=> map.getCanvas().style.cursor='');

    // Map click to pick point
    map.on('click', (e)=>{
      const feats = map.queryRenderedFeatures(e.point,{layers:['traffic-lines','track-circles']});
      if(feats.length) return; // handled above
      pickedCoords = [e.lngLat.lng, e.lngLat.lat];
      const el=document.getElementById('picked-coords');
      if(el) el.textContent = `${e.lngLat.lat.toFixed(4)}, ${e.lngLat.lng.toFixed(4)}`;
      API.reverse(e.lngLat.lat, e.lngLat.lng).then(r=>{
        if(el) el.textContent = (r.display_name||'').split(',').slice(0,3).join(',');
      });
    });
    applyMapTheme(localStorage.getItem('flow-theme')||'system');
  });
  window.addEventListener('resize',()=> map && map.resize());
}

function clearMarkers(){ markers.forEach(m=>m.remove()); markers=[]; }
function addMarker(coords, type){
  const el=document.createElement('div'); el.className= type==='origin'?'map-marker-origin':'map-marker-dest';
  const marker=new maplibregl.Marker({element:el}).setLngLat(coords).addTo(map);
  markers.push(marker); return marker;
}
function fitToGeometry(geometry){
  if(!geometry||!geometry.coordinates||geometry.coordinates.length<2) return;
  const coords=geometry.coordinates;
  const bounds=coords.reduce((b,c)=> b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
  map.fitBounds(bounds, {padding:{top:80,bottom:120,left:80,right:80},duration:1000});
}
function updateRouteSources(routes, selectedId){
  if(!routes||!routes.length) return;
  const alts=routes.filter(r=> r.id!==selectedId);
  map.getSource('routes-alt').setData({type:'FeatureCollection', features: alts.map(r=>({type:'Feature', geometry:r.geometry, properties:{id:r.id}}))});
  const selected=routes.find(r=> r.id===selectedId)||routes.find(r=> r.is_recommended)||routes[0];
  map.getSource('route-bg').setData({type:'FeatureCollection', features: [{type:'Feature', geometry:selected.geometry}]});
  map.getSource('route-main').setData({type:'FeatureCollection', features: [{type:'Feature', geometry:selected.geometry}]});
  currentRouteData=selected; fitToGeometry(selected.geometry);
}
function setTrafficVisibility(showTraffic, showRisk){
  if(!map||!map.getLayer('traffic-lines')) return;
  map.setLayoutProperty('traffic-lines','visibility', showTraffic?'visible':'none');
  map.setLayoutProperty('traffic-highlight-line','visibility', showTraffic?'visible':'none');
  map.setLayoutProperty('risk-circles','visibility', showRisk?'visible':'none');
}
function updateTrackPoints(people){
  if(!map||!map.getSource('track-points')) return;
  const feats = people.filter(p=> p.location).map(p=>({
    type:'Feature',
    geometry:{type:'Point', coordinates:[p.location.lon, p.location.lat]},
    properties:{username: p.username, stale: p.location.stale}
  }));
  map.getSource('track-points').setData({type:'FeatureCollection', features: feats});
}
function updateLiveNav(lon, lat){
  if(!map||!map.getSource('live-nav')) return;
  map.getSource('live-nav').setData({type:'FeatureCollection', features:[{type:'Feature', geometry:{type:'Point', coordinates:[lon,lat]}, properties:{}}]});
}
function clearLiveNav(){
  if(map&&map.getSource('live-nav')) map.getSource('live-nav').setData({type:'FeatureCollection',features:[]});
}
function applyMapTheme(theme){
  if(!map) return;
  const wantsDark= theme==='dark' || (theme==='system' && window.matchMedia('(prefers-color-scheme:dark)').matches);
  const config=window._flowMapConfig; if(!config) return;
  const isCarto=config.style.includes('cartocdn');
  if(isCarto){
    const darkStyle='https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
    const lightStyle='https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
    const target=wantsDark?darkStyle:lightStyle;
    const currentStyle=map.getStyle().sprite||'';
    if((wantsDark&&currentStyle.includes('positron'))||(!wantsDark&&currentStyle.includes('dark-matter'))){
      map.setStyle(target);
      map.once('styledata', ()=>{
        setTimeout(()=>{
          if(!map.getSource('traffic-segments')){
            map.addSource('route-bg',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
            map.addLayer({id:'route-line-bg',type:'line',source:'route-bg',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#9aa0a6','line-width':6}});
            map.addSource('routes-alt',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
            map.addLayer({id:'alt-lines',type:'line',source:'routes-alt',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#9aa0a6','line-width':4,'line-opacity':0.5,'line-dasharray':[2,2]}});
            map.addSource('route-main',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
            map.addLayer({id:'route-main-outline',type:'line',source:'route-main',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#ffffff','line-width':8}});
            map.addSource('traffic-segments',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
            map.addLayer({id:'traffic-lines',type:'line',source:'traffic-segments',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':['get','color'],'line-width':6}});
            map.addSource('traffic-highlight',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
            map.addLayer({id:'traffic-highlight-line',type:'line',source:'traffic-highlight',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#0f6af0','line-width':8,'line-opacity':0.0}});
            map.addSource('risk-points',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
            map.addLayer({id:'risk-circles',type:'circle',source:'risk-points',paint:{'circle-radius':10,'circle-color':'#dc2626','circle-opacity':0.12}});
            map.addSource('track-points',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
            map.addLayer({id:'track-halo',type:'circle',source:'track-points',paint:{'circle-radius':18,'circle-color':'#ff3b30','circle-opacity':0.18}});
            map.addLayer({id:'track-circles',type:'circle',source:'track-points',paint:{'circle-radius':10,'circle-color':'#ff3b30','circle-opacity':0.95,'circle-stroke-width':3,'circle-stroke-color':'#ffffff'}});
            map.addLayer({id:'track-labels',type:'symbol',source:'track-points',layout:{'text-field':['get','username'],'text-size':11,'text-offset':[0,1.7],'text-anchor':'top'},paint:{'text-color':'#ff3b30','text-halo-color':'#ffffff','text-halo-width':1}});
            map.addSource('live-nav',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
            map.addLayer({id:'live-nav-halo',type:'circle',source:'live-nav',paint:{'circle-radius':18,'circle-color':'#0f6af0','circle-opacity':0.18}});
            map.addLayer({id:'live-nav-dot',type:'circle',source:'live-nav',paint:{'circle-radius':8,'circle-color':'#0f6af0','circle-opacity':1,'circle-stroke-width':3,'circle-stroke-color':'#ffffff'}});
          }
          if(window._lastRoutes) updateRouteSources(window._lastRoutes, window._selectedRouteId);
          if(window._lastTraffic) map.getSource('traffic-segments').setData(window._lastTraffic);
        },400);
      });
    }
  }
}
