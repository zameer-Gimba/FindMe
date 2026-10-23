// Simulated cell towers. In production the mobile network (MTN, Airtel, Glo,
// 9mobile) would tell us which tower a keypad phone is on; here the simulator
// picks one. Rural towers cover a much wider radius than city ones.

export const TOWERS = [
  { id: 'ABJ-WUSE', label: 'Wuse, Abuja (city)', state: 'FC', area: 'FC-01-A01', stateName: 'Federal Capital Territory', lgaName: 'Abuja Municipal', lat: 9.0579, lng: 7.4951, radius_m: 1500 },
  { id: 'ABJ-KUJE', label: 'Kuje, FCT (semi-urban)', state: 'FC', area: null, stateName: 'Federal Capital Territory', lgaName: 'Kuje', lat: 8.8794, lng: 7.2276, radius_m: 6000 },
  { id: 'ZAM-TSAFE', label: 'Tsafe, Zamfara (rural)', state: null, area: null, stateName: 'Zamfara', lgaName: 'Tsafe', lat: 11.9580, lng: 6.9200, radius_m: 15000 },
  { id: 'BOR-GWOZA', label: 'Gwoza, Borno (rural)', state: null, area: null, stateName: 'Borno', lgaName: 'Gwoza', lat: 11.0830, lng: 13.6900, radius_m: 15000 },
  { id: 'KOG-LOKOJA', label: 'Lokoja, Kogi (town)', state: null, area: null, stateName: 'Kogi', lgaName: 'Lokoja', lat: 7.8023, lng: 6.7333, radius_m: 4000 },
];

export function findTower(id) {
  return TOWERS.find((t) => t.id === id) || TOWERS.find((t) => t.id === process.env.DEFAULT_TOWER) || TOWERS[0];
}
