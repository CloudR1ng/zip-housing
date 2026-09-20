// Authored synthetic fixtures. Coordinates describe approximate neighborhoods, not listings.
export const regions = [
 ['서울',37.55,126.98,['관악구 봉천동','마포구 성산동','동대문구 회기동','성북구 정릉동'],1.35,'서울역'],
 ['부산',35.16,129.06,['금정구 장전동','부산진구 전포동','남구 대연동','동래구 명륜동'],1.0,'부산역'],
 ['대구',35.87,128.60,['북구 산격동','달서구 신당동','수성구 만촌동','중구 대봉동'],0.87,'동대구역'],
 ['인천',37.46,126.70,['미추홀구 용현동','부평구 부평동','연수구 연수동','남동구 구월동'],1.04,'인천시청'],
 ['광주',35.16,126.85,['북구 용봉동','동구 지산동','서구 쌍촌동','광산구 월계동'],0.80,'광주송정역'],
 ['대전',36.36,127.35,['유성구 궁동','유성구 어은동','서구 월평동','유성구 봉명동'],0.91,'충남대학교'],
 ['울산',35.54,129.31,['남구 무거동','중구 우정동','남구 삼산동','북구 연암동'],0.91,'울산대학교'],
 ['세종',36.50,127.26,['조치원읍','도담동','새롬동','나성동'],0.98,'정부세종청사'],
 ['경기',37.27,127.03,['수원시 영통동','성남시 야탑동','안산시 사동','용인시 보정동'],1.13,'수원역'],
 ['강원',37.88,127.73,['춘천시 효자동','춘천시 석사동','춘천시 후평동','춘천시 퇴계동'],0.78,'강원대학교'],
 ['충북',36.63,127.46,['청주시 사창동','청주시 개신동','청주시 복대동','청주시 봉명동'],0.79,'충북대학교'],
 ['충남',36.81,127.14,['천안시 안서동','천안시 두정동','천안시 신부동','천안시 쌍용동'],0.81,'천안역'],
 ['전북',35.84,127.13,['전주시 금암동','전주시 덕진동','전주시 효자동','전주시 인후동'],0.74,'전북대학교'],
 ['전남',34.81,126.42,['목포시 용해동','목포시 상동','목포시 옥암동','목포시 석현동'],0.73,'목포역'],
 ['경북',35.83,128.75,['경산시 대동','경산시 조영동','경산시 중방동','경산시 옥산동'],0.72,'영남대학교'],
 ['경남',35.23,128.68,['창원시 사림동','창원시 용호동','창원시 상남동','창원시 팔용동'],0.84,'창원대학교'],
 ['제주',33.49,126.53,['제주시 아라동','제주시 이도동','제주시 노형동','제주시 일도동'],0.99,'제주대학교'],
].map(([name,lat,lng,areas,factor,destination])=>({name,lat,lng,areas,factor,destination}));
const offsets = [[.006,.003],[.015,-.012],[-.018,.019],[-.009,.028]];
export const homes = regions.flatMap((r,ri)=>r.areas.map((area,i)=>({
 id:`ZIP-${String(ri+1).padStart(2,'0')}${i+1}`,region:r.name,area,
 title:['캠퍼스 가까운 생활권','공원 곁의 여유로운 생활권','교통이 편리한 생활권','일상을 채우는 생활권'][i],
 rent:Math.round([36,43,48,54][i]*r.factor),deposit:[300,500,800,1000][i],fee:[5,4,7,6][i],size:[19,24,29,33][i],
 transit:[13,20,26,32][i],walk:[4,7,3,6][i],soc:[82,93,87,96][i],buildingAge:[14,8,5,3][i],
 safetyAccess:[78,88,86,91][i],uncertainty:[22,14,12,9][i],
 lat:r.lat+offsets[i][0],lng:r.lng+offsets[i][1],destination:r.destination,
 tags:[['대학가','합리적인 주거비'],['공원 인접','조용한 생활'],['대중교통','생활 편의'],['넓은 면적','다양한 생활시설']][i],
 source:'MVP 합성 시연 데이터 v1',asOf:'2026-09-21',
})));
export const defaults = {region:'대전',budget:65,deposit:1000,commute:40,minSize:15,priority:'balanced'};
export function normalizeConditions(input={}, previous=defaults) {
 const c={...previous};
 if(regions.some(r=>r.name===input.region))c.region=input.region;
 const limits={budget:[1,300],deposit:[0,30000],commute:[1,180],minSize:[0,100]};
 for(const [k,[min,max]] of Object.entries(limits))if(input[k]!==undefined&&Number.isFinite(Number(input[k])))c[k]=Math.max(min,Math.min(max,Number(input[k])));
 if(['balanced','cost','transit','life'].includes(input.priority))c.priority=input.priority;
 return c;
}
export function score(home,c) {
 const cost=Math.min(100,(home.rent+home.fee)/c.budget*100);
 const transit=Math.min(100,home.transit/c.commute*100);
 const age=Math.min(100,home.buildingAge/40*100);
 const w={balanced:[.3,.25,.2,.1,.1,.05],cost:[.55,.15,.1,.08,.07,.05],transit:[.15,.55,.1,.08,.07,.05],life:[.15,.15,.4,.1,.15,.05]}[c.priority];
 const values=[cost,transit,100-home.soc,age,100-home.safetyAccess,home.uncertainty];
 const hii=Math.round(values.reduce((s,v,i)=>s+v*w[i],0));
 return {...home,total:home.rent+home.fee,hii,fit:100-hii,components:values.map((value,i)=>({name:['주거비 부담','이동 부담','생활시설 결핍','건물 노후도','안전시설 접근 결핍','거주 불확실성'][i],value:Math.round(value),weight:w[i]}))};
}
export function search(c) {
 return homes.filter(h=>h.region===c.region&&h.rent+h.fee<=c.budget&&h.deposit<=c.deposit&&h.transit<=c.commute&&h.size>=c.minSize).map(h=>score(h,c)).sort((a,b)=>b.fit-a.fit||a.total-b.total);
}
export function comparison(ids,c) {return [...new Set(ids)].slice(0,3).map(id=>homes.find(h=>h.id===id)).filter(Boolean).map(h=>score(h,c));}
