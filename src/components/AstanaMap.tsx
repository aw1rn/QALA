import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { ASTANA_CENTER } from '../data/astanaData';
import type {
  ApartmentListing,
  AstanaBusStop,
  AstanaExtraPlace,
  AstanaNoParkingSign,
  AstanaOsmParking,
  AstanaParking,
  AstanaPlace,
  AstanaSergekPoint,
  AstanaTrafficLight,
  BusRouteInfo,
  DeliveryStop,
  LiveBusMarker,
  MapBookmark,
  MapNote,
  SergekCamera,
  TomTomIncident,
  TrafficSegment,
} from '../types/qala';
import { API_BASE } from '../apiBase';

export interface SelectedMapFeature {
  kind: 'parking' | 'bus' | 'camera' | 'trafficLight' | 'place' | 'noParking' | 'incident';
  title: string;
  subtitle: string;
  lat: number;
  lng: number;
  details?: Array<[string, string]>;
}

interface AstanaMapProps {
  center?: [number, number];
  zoom?: number;
  places?: AstanaPlace[];
  apartments?: ApartmentListing[];
  selectedApartmentId?: string | null;
  deliveryStops?: DeliveryStop[];
  routeCoordinates?: Array<[number, number]>;
  trafficSegments?: TrafficSegment[];
  sergekCameras?: SergekCamera[];
  paidParkings?: AstanaParking[];
  osmParkings?: AstanaOsmParking[];
  noParkingSigns?: AstanaNoParkingSign[];
  busStops?: AstanaBusStop[];
  trafficLights?: AstanaTrafficLight[];
  sergekPoints?: AstanaSergekPoint[];
  extraPlaces?: AstanaExtraPlace[];
  tomtomLiveEnabled?: boolean;
  busRoute?: BusRouteInfo | null;
  taxiEndpoints?: {
    from?: { name: string; lat: number; lng: number };
    to?: { name: string; lat: number; lng: number };
  } | null;
  viaWaypoint?: { name: string; lat: number; lng: number } | null;
  incidents?: TomTomIncident[];
  courierPosition?: { lat: number; lng: number; label: string } | null;
  userLocation?: [number, number] | null;
  bookmarks?: MapBookmark[];
  mapNotes?: MapNote[];
  liveBuses?: LiveBusMarker[];
  simCarPosition?: [number, number] | null;
  interactive?: boolean;
  onSelectApartment?: (apt: ApartmentListing) => void;
  onSelectPlace?: (place: AstanaPlace) => void;
  onSelectFeature?: (feature: SelectedMapFeature) => void;
  onMapClick?: (lat: number, lng: number) => void;
  className?: string;
}

export function AstanaMap({
  center = ASTANA_CENTER,
  zoom = 12,
  places = [],
  apartments = [],
  selectedApartmentId,
  deliveryStops = [],
  routeCoordinates = [],
  trafficSegments = [],
  sergekCameras = [],
  paidParkings = [],
  osmParkings = [],
  noParkingSigns = [],
  busStops = [],
  trafficLights = [],
  sergekPoints = [],
  extraPlaces = [],
  tomtomLiveEnabled = false,
  busRoute = null,
  taxiEndpoints = null,
  viaWaypoint = null,
  incidents = [],
  courierPosition = null,
  userLocation = null,
  bookmarks = [],
  mapNotes = [],
  liveBuses = [],
  simCarPosition = null,
  interactive = true,
  onSelectApartment,
  onSelectPlace,
  onSelectFeature,
  onMapClick,
  className = 'h-full w-full',
}: AstanaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const dynamicLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const lastFittedKeyRef = useRef<string>('');
  const canvasRendererRef = useRef<L.Canvas | null>(null);
  const tomtomLayerRef = useRef<L.TileLayer | null>(null);
  const onMapClickRef = useRef(onMapClick);
  const onSelectFeatureRef = useRef(onSelectFeature);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    onSelectFeatureRef.current = onSelectFeature;
  }, [onSelectFeature]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center,
      zoom,
      preferCanvas: true,
      zoomControl: interactive,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: interactive,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const canvasRenderer = L.canvas({ padding: 0.4 });
    const group = L.layerGroup().addTo(map);
    const dynamicGroup = L.layerGroup().addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClickRef.current?.(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;
    layerGroupRef.current = group;
    dynamicLayerGroupRef.current = dynamicGroup;
    canvasRendererRef.current = canvasRenderer;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      dynamicLayerGroupRef.current = null;
      canvasRendererRef.current = null;
      tomtomLayerRef.current = null;
    };
  }, [interactive]);

  // TomTom Live Traffic Flow Tile Layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tomtomLiveEnabled) {
      if (!tomtomLayerRef.current) {
        tomtomLayerRef.current = L.tileLayer(`${API_BASE}/api/map/tomtom/tile/{z}/{x}/{y}.png`, {
          opacity: 0.82,
          maxZoom: 18,
          minZoom: 10,
        }).addTo(map);
      }
    } else if (tomtomLayerRef.current) {
      tomtomLayerRef.current.remove();
      tomtomLayerRef.current = null;
    }
  }, [tomtomLiveEnabled]);

  // Update center when explicitly changed
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView(center, zoom, { animate: true });
  }, [center[0], center[1], zoom]);

  // Render markers, polygons, polylines on Canvas/DOM
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    const renderer = canvasRendererRef.current ?? undefined;
    if (!map || !group) return;

    group.clearLayers();

    // 1. No-parking signs (3.27 / 3.28) polylines
    for (const sg of noParkingSigns) {
      if (sg.line.length < 2) continue;
      const line = L.polyline(sg.line, {
        renderer,
        color: '#E11D48',
        weight: 3.5,
        dashArray: '6 5',
        opacity: 0.85,
      });
      line.bindTooltip(`Знак ${sg.sign} (${sg.side}) · ${sg.desc}`, { sticky: true });
      line.on('click', () => {
        const mid = sg.line[0];
        onSelectFeatureRef.current?.({
          kind: 'noParking',
          title: `Запрет стоянки · знак ${sg.sign}`,
          subtitle: sg.desc,
          lat: mid[0],
          lng: mid[1],
          details: [
            ['Знак ПДД', sg.sign],
            ['Сторона', sg.side || '—'],
            ['Участок', sg.desc],
          ],
        });
      });
      line.addTo(group);
    }

    // 2. Paid Parking Polygons & Points (ЦОДД Астаны)
    for (const pk of paidParkings) {
      if (pk.ring.length >= 3) {
        const poly = L.polygon(pk.ring, {
          renderer,
          color: '#2563EB',
          weight: 1.5,
          fillColor: '#3B82F6',
          fillOpacity: 0.22,
        });
        poly.bindTooltip(
          `Парковка №${pk.num} · ${pk.price > 0 ? `${pk.price} ₸/ч` : 'Бесплатно'} · ${pk.spaces} мест`,
          { sticky: true }
        );
        poly.on('click', () => {
          onSelectFeatureRef.current?.({
            kind: 'parking',
            title: `Парковка ЦОДД · зона ${pk.zone || pk.num}`,
            subtitle: pk.addr,
            lat: pk.lat,
            lng: pk.lng,
            details: [
              ['Тариф', pk.price > 0 ? `${pk.price} ₸/час` : 'Бесплатно'],
              ['Мест', String(pk.spaces || '—')],
              ['Зона', pk.zone || pk.num],
              ['Описание', pk.desc || 'Городская парковка Астаны'],
            ],
          });
        });
        poly.addTo(group);
      }

      const dot = L.circleMarker([pk.lat, pk.lng], {
        renderer,
        radius: 5,
        color: '#FFFFFF',
        weight: 1.5,
        fillColor: '#2563EB',
        fillOpacity: 0.95,
      });
      dot.bindTooltip(
        `P · ${pk.addr || `Зона ${pk.zone}`} · ${pk.price > 0 ? `${pk.price} ₸/ч` : 'Бесплатно'}`,
        { direction: 'top' }
      );
      dot.on('click', () => {
        onSelectFeatureRef.current?.({
          kind: 'parking',
          title: `Парковка ЦОДД · зона ${pk.zone || pk.num}`,
          subtitle: pk.addr,
          lat: pk.lat,
          lng: pk.lng,
          details: [
            ['Тариф', pk.price > 0 ? `${pk.price} ₸/час` : 'Бесплатно'],
            ['Мест', String(pk.spaces || '—')],
            ['Зона', pk.zone || pk.num],
            ['Описание', pk.desc || 'Городская парковка Астаны'],
          ],
        });
      });
      dot.addTo(group);
    }

    // 3. Free / OSM Parkings
    for (const op of osmParkings) {
      const dot = L.circleMarker([op.lat, op.lng], {
        renderer,
        radius: 4.5,
        color: '#FFFFFF',
        weight: 1,
        fillColor: '#0EA5E9',
        fillOpacity: 0.85,
      });
      dot.bindTooltip(`P · ${op.name}`, { direction: 'top' });
      dot.on('click', () => {
        onSelectFeatureRef.current?.({
          kind: 'parking',
          title: op.name,
          subtitle: 'Общественная парковка (OSM)',
          lat: op.lat,
          lng: op.lng,
        });
      });
      dot.addTo(group);
    }

    // 4. Bus Stops (1,048 stops from OSM Astana)
    for (const bs of busStops) {
      const dot = L.circleMarker([bs.lat, bs.lng], {
        renderer,
        radius: 4.5,
        color: '#FFFFFF',
        weight: 1.2,
        fillColor: '#0284C7',
        fillOpacity: 0.92,
      });
      dot.bindTooltip(
        `Остановка: ${bs.name}${bs.routes ? ` · маршруты ${bs.routes}` : ''}`,
        { direction: 'top' }
      );
      dot.on('click', () => {
        onSelectFeatureRef.current?.({
          kind: 'bus',
          title: bs.name,
          subtitle: bs.nameKk && bs.nameKk !== bs.name ? bs.nameKk : 'Автобусная остановка Астаны',
          lat: bs.lat,
          lng: bs.lng,
          details: bs.routes ? [['Маршруты', bs.routes]] : undefined,
        });
      });
      dot.addTo(group);
    }

    // 5. Traffic Lights (810 traffic lights)
    for (const tl of trafficLights) {
      const dot = L.circleMarker([tl.lat, tl.lng], {
        renderer,
        radius: 4,
        color: '#1E293B',
        weight: 1.2,
        fillColor: '#F59E0B',
        fillOpacity: 0.95,
      });
      dot.bindTooltip('Светофор · перекрёсток Астаны', { direction: 'top' });
      dot.on('click', () => {
        onSelectFeatureRef.current?.({
          kind: 'trafficLight',
          title: 'Светофорный объект',
          subtitle: `${tl.lat.toFixed(5)}, ${tl.lng.toFixed(5)}`,
          lat: tl.lat,
          lng: tl.lng,
        });
      });
      dot.addTo(group);
    }

    // 6. Real Sergek Cameras (582+ from QalaKarta)
    for (const sk of sergekPoints) {
      const dot = L.circleMarker([sk.lat, sk.lng], {
        renderer,
        radius: 5,
        color: '#FFFFFF',
        weight: 1.5,
        fillColor: '#7C3AED',
        fillOpacity: 0.95,
      });
      dot.bindTooltip(
        `Камера «Сергек»${sk.hits ? ` · ${sk.hits.toLocaleString('ru-RU')} проездов/нед` : ''}`,
        { direction: 'top' }
      );
      dot.on('click', () => {
        onSelectFeatureRef.current?.({
          kind: 'camera',
          title: 'Камера видеофиксации «Сергек»',
          subtitle: 'Контроль скорости и ПДД',
          lat: sk.lat,
          lng: sk.lng,
          details: sk.hits
            ? [['Интенсивность', `${sk.hits.toLocaleString('ru-RU')} авто/нед`]]
            : undefined,
        });
      });
      dot.addTo(group);
    }

    // 7. Extra POIs (Fuel, Pharmacy, Cinema, Cafe, Bank)
    for (const ex of extraPlaces) {
      const color =
        ex.category === 'fuel'
          ? '#EA580C'
          : ex.category === 'pharmacy' || ex.category === 'clinic'
          ? '#16A34A'
          : ex.category === 'cinema'
          ? '#E11D48'
          : '#64748B';
      const dot = L.circleMarker([ex.lat, ex.lng], {
        renderer,
        radius: 4.5,
        color: '#FFFFFF',
        weight: 1,
        fillColor: color,
        fillOpacity: 0.88,
      });
      dot.bindTooltip(`${ex.name}${ex.address ? ` · ${ex.address}` : ''}`, { direction: 'top' });
      dot.on('click', () => {
        const details: Array<[string, string]> = [['Категория', ex.category]];
        if (ex.phone) details.push(['Телефон', ex.phone]);
        if (ex.hours) details.push(['Часы работы', ex.hours]);
        if (ex.website) details.push(['Сайт', ex.website]);
        onSelectFeatureRef.current?.({
          kind: 'place',
          title: ex.name,
          subtitle: ex.address || 'Астана',
          lat: ex.lat,
          lng: ex.lng,
          details,
        });
      });
      dot.addTo(group);
    }

    // 8. Traffic road polylines
    for (const seg of trafficSegments) {
      if (seg.coords.length < 2) continue;
      const color =
        seg.level === 'busy'
          ? '#E11D48'
          : seg.level === 'moderate'
          ? '#F59E0B'
          : '#10B981';
      const line = L.polyline(seg.coords, {
        renderer,
        color,
        weight: 6,
        opacity: 0.85,
        lineJoin: 'round',
      });
      line.bindTooltip(`${seg.street} · ${seg.speedKmh} км/ч (${seg.score}/10)`, {
        sticky: true,
      });
      line.addTo(group);
    }

    // 9. Named Sergek cameras (curated)
    for (const cam of sergekCameras) {
      const icon = L.divIcon({
        className: '',
        html: `<div class="qala-camera-pin">${cam.limitKmh}</div>`,
        iconSize: [30, 22],
        iconAnchor: [15, 11],
      });
      const marker = L.marker([cam.lat, cam.lng], { icon });
      marker.bindTooltip(`${cam.name} · ${cam.intersection} · лимит ${cam.limitKmh} км/ч`, {
        direction: 'top',
      });
      marker.on('click', () => {
        onSelectFeatureRef.current?.({
          kind: 'camera',
          title: cam.name,
          subtitle: cam.intersection,
          lat: cam.lat,
          lng: cam.lng,
          details: [['Лимит скорости', `${cam.limitKmh} км/ч`]],
        });
      });
      marker.addTo(group);
    }

    // 10. Bus Route Polyline + Waypoint Stops
    if (busRoute && busRoute.waypoints.length >= 2) {
      const coords = busRoute.waypoints.map((w): [number, number] => [w.lat, w.lng]);
      const line = L.polyline(coords, {
        color: busRoute.color || '#0284C7',
        weight: 5.5,
        opacity: 0.92,
        dashArray: '10 6',
      });
      line.bindTooltip(`Автобус №${busRoute.number} · ${busRoute.interval} · ${busRoute.fare}`);
      line.addTo(group);

      busRoute.waypoints.forEach((wp, idx) => {
        const icon = L.divIcon({
          className: '',
          html: `<div style="background:${busRoute.color || '#0284C7'};color:#fff;border:2px solid #fff;border-radius:999px;padding:2px 7px;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 3px 10px rgba(2,132,199,0.4);">${idx + 1}. ${wp.name}</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker([wp.lat, wp.lng], { icon, zIndexOffset: 350 }).addTo(group);
      });

      const fitKey = `bus:${busRoute.number}`;
      if (interactive && lastFittedKeyRef.current !== fitKey) {
        lastFittedKeyRef.current = fitKey;
        map.fitBounds(line.getBounds(), { padding: [45, 45], maxZoom: 14 });
      }
    }

    // 11. Active Car / Taxi Route polyline
    if (routeCoordinates.length >= 2) {
      const polyline = L.polyline(routeCoordinates, {
        color: '#2563EB',
        weight: 5.5,
        opacity: 0.9,
        lineJoin: 'round',
      });
      polyline.addTo(group);
      const firstPt = routeCoordinates[0];
      const lastPt = routeCoordinates[routeCoordinates.length - 1];
      const fitKey = `route:${routeCoordinates.length}:${firstPt[0].toFixed(4)},${firstPt[1].toFixed(4)}->${lastPt[0].toFixed(4)},${lastPt[1].toFixed(4)}`;
      if (interactive && !busRoute && lastFittedKeyRef.current !== fitKey) {
        lastFittedKeyRef.current = fitKey;
        map.fitBounds(polyline.getBounds(), { padding: [44, 44], maxZoom: 14 });
      }
    }

    // 12. Taxi A/B Endpoint Pins
    if (taxiEndpoints?.from) {
      const iconA = L.divIcon({
        className: '',
        html: `<div style="background:#0F172A;color:#fff;border:2px solid #fff;border-radius:999px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;box-shadow:0 4px 12px rgba(15,23,42,0.4);">A</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      L.marker([taxiEndpoints.from.lat, taxiEndpoints.from.lng], {
        icon: iconA,
        zIndexOffset: 600,
      })
        .bindTooltip(`Откуда: ${taxiEndpoints.from.name}`, { direction: 'top' })
        .addTo(group);
    }
    if (taxiEndpoints?.to) {
      const iconB = L.divIcon({
        className: '',
        html: `<div style="background:#F59E0B;color:#0F172A;border:2px solid #fff;border-radius:999px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;box-shadow:0 4px 12px rgba(245,158,11,0.45);">B</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });
      L.marker([taxiEndpoints.to.lat, taxiEndpoints.to.lng], {
        icon: iconB,
        zIndexOffset: 600,
      })
        .bindTooltip(`Куда: ${taxiEndpoints.to.name}`, { direction: 'top' })
        .addTo(group);
    }
    if (viaWaypoint) {
      const iconC = L.divIcon({
        className: '',
        html: `<div style="background:#7C3AED;color:#fff;border:2px solid #fff;border-radius:999px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;box-shadow:0 4px 12px rgba(124,58,237,0.5);">C</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      L.marker([viaWaypoint.lat, viaWaypoint.lng], {
        icon: iconC,
        zIndexOffset: 590,
      })
        .bindTooltip(`Заезд: ${viaWaypoint.name}`, { direction: 'top' })
        .addTo(group);
    }

    // 12b. Live TomTom Road Incidents
    for (const inc of incidents) {
      if (!inc.coords || inc.coords.length === 0) continue;
      if (inc.coords.length >= 2) {
        L.polyline(inc.coords, {
          renderer,
          color: inc.magnitude >= 3 ? '#E11D48' : '#EA580C',
          weight: 5,
          dashArray: '4 6',
          opacity: 0.9,
        }).addTo(group);
      }
      const p0 = inc.coords[0];
      const incIcon = L.divIcon({
        className: '',
        html: `<div style="width:24px;height:24px;border-radius:999px;background:${inc.magnitude >= 3 ? '#E11D48' : '#EA580C'};color:#fff;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;box-shadow:0 4px 12px rgba(225,29,72,0.55);">!</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const marker = L.marker(p0, { icon: incIcon, zIndexOffset: 560 });
      marker.bindTooltip(`${inc.description}${inc.delaySec ? ` · +${Math.round(inc.delaySec / 60)} мин` : ''}`, {
        direction: 'top',
      });
      marker.on('click', () => {
        onSelectFeatureRef.current?.({
          kind: 'incident',
          title: inc.description || 'Дорожный инцидент',
          subtitle: inc.from && inc.to ? `${inc.from} → ${inc.to}` : 'Дорожное событие Астаны',
          lat: p0[0],
          lng: p0[1],
          details: [
            ['Задержка', inc.delaySec > 0 ? `+${Math.max(1, Math.round(inc.delaySec / 60))} мин` : 'Уточняется'],
            ['Уровень', `${inc.magnitude || 2}/4`],
            ...(inc.from ? ([['От', inc.from]] as Array<[string, string]>) : []),
            ...(inc.to ? ([['До', inc.to]] as Array<[string, string]>) : []),
          ],
        });
      });
      marker.addTo(group);
    }

    // 13. Curated Astana Places (landmarks, parking, bus stops)
    for (const place of places) {
      const isParking = place.category === 'parking';
      const isBus = place.category === 'bus';
      const html = isParking
        ? `<div class="qala-parking-pin">P</div>`
        : isBus
        ? `<div style="background:#0EA5E9;color:#fff;border:1.5px solid #fff;border-radius:999px;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;box-shadow:0 2px 6px rgba(14,165,233,0.4);">A</div>`
        : `<div style="background:#0F172A;color:#fff;border:2px solid #fff;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 3px 10px rgba(15,23,42,0.28);">${place.name}</div>`;

      const icon = L.divIcon({
        className: '',
        html,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([place.lat, place.lng], { icon });
      marker.bindTooltip(`${place.name} · ${place.address}`, { direction: 'top' });
      marker.on('click', () => {
        onSelectPlace?.(place);
        onSelectFeatureRef.current?.({
          kind: place.category === 'parking' ? 'parking' : place.category === 'bus' ? 'bus' : 'place',
          title: place.name,
          subtitle: place.address,
          lat: place.lat,
          lng: place.lng,
          details: place.info ? [['Инфо', place.info]] : undefined,
        });
      });
      marker.addTo(group);
    }

    // 14. Apartment Price Pins (Qala Үй)
    for (const apt of apartments) {
      const shortPrice =
        apt.price >= 1000
          ? `${Math.round(apt.price / 1000)}k`
          : `${apt.price} ₸`;
      const isSelected = apt.id === selectedApartmentId;
      const icon = L.divIcon({
        className: '',
        html: `<div class="qala-price-pin ${isSelected ? 'active' : ''}">${shortPrice}</div>`,
        iconSize: [52, 24],
        iconAnchor: [26, 12],
      });

      const marker = L.marker([apt.lat, apt.lng], {
        icon,
        zIndexOffset: isSelected ? 500 : 100,
      });
      marker.bindTooltip(`${apt.address} · ${apt.price.toLocaleString('ru-RU')} ₸`, {
        direction: 'top',
      });
      if (onSelectApartment) {
        marker.on('click', () => onSelectApartment(apt));
      }
      marker.addTo(group);
    }

    // 15. Delivery Stops (Qala Delivery)
    deliveryStops.forEach((stop, index) => {
      const icon = L.divIcon({
        className: '',
        html: `<div class="qala-stop-pin" style="${
          stop.done ? 'background:#16A34A;' : ''
        }">${index + 1}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const marker = L.marker([stop.lat, stop.lng], { icon });
      marker.bindTooltip(`${index + 1}. ${stop.name}`, { direction: 'top' });
      marker.addTo(group);
    });

    // 16. Saved User Map Bookmarks (Дом / Работа / Парковка / Избранное)
    for (const bm of bookmarks) {
      const glyph =
        bm.kind === 'home'
          ? '🏠'
          : bm.kind === 'work'
          ? '💼'
          : bm.kind === 'parking'
          ? '🅿️'
          : '⭐';
      const bg =
        bm.kind === 'home'
          ? '#0F172A'
          : bm.kind === 'work'
          ? '#2563EB'
          : bm.kind === 'parking'
          ? '#0284C7'
          : '#D97706';
      const icon = L.divIcon({
        className: '',
        html: `<div style="display:inline-flex;align-items:center;gap:4px;background:${bg};color:#fff;border:2px solid #fff;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 4px 12px rgba(15,23,42,0.35);"><span>${glyph}</span><span>${bm.label}</span></div>`,
        iconSize: [28, 24],
        iconAnchor: [14, 12],
      });
      const marker = L.marker([bm.lat, bm.lng], { icon, zIndexOffset: 420 });
      marker.bindTooltip(`${glyph} ${bm.label} · ${bm.address}`, { direction: 'top' });
      marker.on('click', () => {
        onSelectFeatureRef.current?.({
          kind: bm.kind === 'parking' ? 'parking' : 'place',
          title: bm.label,
          subtitle: bm.address,
          lat: bm.lat,
          lng: bm.lng,
          details: [
            [
              'Закладка',
              bm.kind === 'home'
                ? 'Дом'
                : bm.kind === 'work'
                ? 'Работа'
                : bm.kind === 'parking'
                ? 'Парковка'
                : 'Избранное',
            ],
          ],
        });
      });
      marker.addTo(group);
    }

    // 17. Personal Map Notes, Parked Car Pin & Family Geofences
    for (const mn of mapNotes) {
      const glyph =
        mn.kind === 'parked_car' ? '🚗' : mn.kind === 'family_zone' ? '🛡️' : '📌';
      const bg =
        mn.kind === 'parked_car'
          ? '#059669'
          : mn.kind === 'family_zone'
          ? '#7C3AED'
          : '#E11D48';
      const icon = L.divIcon({
        className: '',
        html: `<div style="display:inline-flex;align-items:center;gap:4px;background:${bg};color:#fff;border:2px solid #fff;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 4px 12px rgba(15,23,42,0.35);"><span>${glyph}</span><span>${mn.title}</span></div>`,
        iconSize: [30, 24],
        iconAnchor: [15, 12],
      });
      const marker = L.marker([mn.lat, mn.lng], { icon, zIndexOffset: 480 });
      marker.bindTooltip(`${glyph} ${mn.title}${mn.note ? ` · ${mn.note}` : ''}`, {
        direction: 'top',
      });
      marker.on('click', () => {
        onSelectFeatureRef.current?.({
          kind: mn.kind === 'parked_car' ? 'parking' : 'place',
          title: mn.title,
          subtitle: mn.address || 'Моя метка на карте',
          lat: mn.lat,
          lng: mn.lng,
          details: [
            ['Тип', mn.kind === 'parked_car' ? 'Припаркованное авто' : mn.kind === 'family_zone' ? 'Семейная геозона' : 'Личная заметка'],
            ...(mn.note ? ([['Заметка', mn.note]] as Array<[string, string]>) : []),
            ['Оценка', `${'★'.repeat(Math.max(1, Math.min(5, mn.rating || 5)))}`],
          ],
        });
      });
      marker.addTo(group);
    }
  }, [
    apartments,
    bookmarks,
    busRoute,
    busStops,
    deliveryStops,
    extraPlaces,
    incidents,
    interactive,
    mapNotes,
    noParkingSigns,
    onSelectApartment,
    onSelectPlace,
    osmParkings,
    paidParkings,
    places,
    routeCoordinates,
    selectedApartmentId,
    sergekCameras,
    sergekPoints,
    taxiEndpoints,
    trafficLights,
    trafficSegments,
    viaWaypoint,
  ]);

  // Dynamic fast-updating layers: GPS userLocation, Live Buses, Simulated Navigator Cursor
  useEffect(() => {
    const dyn = dynamicLayerGroupRef.current;
    if (!dyn) return;
    dyn.clearLayers();

    if (userLocation) {
      L.circle(userLocation, {
        radius: 95,
        color: '#2563EB',
        weight: 1,
        fillColor: '#3B82F6',
        fillOpacity: 0.14,
      }).addTo(dyn);

      const gpsIcon = L.divIcon({
        className: '',
        html: `<div style="position:relative;width:22px;height:22px;display:flex;align-items:center;justify-content:center;">
          <span style="position:absolute;inset:0;border-radius:999px;background:rgba(37,99,235,0.35);animation:ping 1.8s cubic-bezier(0,0,0.2,1) infinite;"></span>
          <span style="width:13px;height:13px;border-radius:999px;background:#2563EB;border:2.5px solid #fff;box-shadow:0 2px 8px rgba(37,99,235,0.55);"></span>
        </div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      L.marker(userLocation, { icon: gpsIcon, zIndexOffset: 750 })
        .bindTooltip('Моё местоположение (GPS)', { direction: 'top' })
        .addTo(dyn);
    }

    for (const bus of liveBuses) {
      const busIcon = L.divIcon({
        className: '',
        html: `<div style="display:inline-flex;align-items:center;gap:4px;background:${bus.color || '#0284C7'};color:#fff;border:2px solid #fff;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 4px 12px rgba(2,132,199,0.5);">🚌 №${bus.number} · ${bus.etaMin} мин</div>`,
        iconSize: [86, 24],
        iconAnchor: [43, 12],
      });
      L.marker([bus.lat, bus.lng], { icon: busIcon, zIndexOffset: 680 })
        .bindTooltip(`Автобус №${bus.number} · След.: ${bus.nextStop} (~${bus.etaMin} мин)`, {
          direction: 'top',
        })
        .addTo(dyn);
    }

    if (simCarPosition) {
      const carIcon = L.divIcon({
        className: '',
        html: `<div style="width:28px;height:28px;border-radius:999px;background:#F59E0B;color:#0F172A;border:2.5px solid #fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;box-shadow:0 4px 14px rgba(245,158,11,0.65);">🚘</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker(simCarPosition, { icon: carIcon, zIndexOffset: 800 })
        .bindTooltip('Навигатор QALA в пути', { direction: 'top' })
        .addTo(dyn);
    }

    if (courierPosition) {
      const courierIcon = L.divIcon({
        className: '',
        html: `<div style="display:inline-flex;align-items:center;gap:4px;background:#EA580C;color:#fff;border:2px solid #fff;border-radius:999px;padding:3px 9px;font-size:11px;font-weight:800;white-space:nowrap;box-shadow:0 4px 14px rgba(234,88,12,0.55);">🛵 ${courierPosition.label}</div>`,
        iconSize: [110, 26],
        iconAnchor: [55, 13],
      });
      L.marker([courierPosition.lat, courierPosition.lng], { icon: courierIcon, zIndexOffset: 820 })
        .bindTooltip(courierPosition.label, { direction: 'top' })
        .addTo(dyn);
    }
  }, [courierPosition, liveBuses, simCarPosition, userLocation]);

  return <div ref={containerRef} className={className} />;
}
