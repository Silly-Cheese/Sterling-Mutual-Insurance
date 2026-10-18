export function localISODate(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw Error("Invalid date.");
  return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
}
export function filterAppointments(records,{query="",status="all",sort="soonest"}={}) {
  const term=String(query).trim().toLocaleLowerCase();
  const filtered=records.filter(a=>{
    const current=a.status||"scheduled";
    return (status==="all"||current===status)&&(!term||
      [a.customerName,a.department,a.reason,a.date,a.assignedName].some(v=>String(v||"").toLocaleLowerCase().includes(term)));
  });
  filtered.sort((a,b)=>{
    const compare=String(a.date||"")+" "+String(a.time||"");
    const opposite=String(b.date||"")+" "+String(b.time||"");
    const date=compare.localeCompare(opposite);
    if(sort==="latest")return -date||String(a.id||"").localeCompare(String(b.id||""));
    if(sort==="customer")return String(a.customerName||"").localeCompare(String(b.customerName||""))||date;
    return date||String(a.customerName||"").localeCompare(String(b.customerName||""));
  });
  return filtered;
}
