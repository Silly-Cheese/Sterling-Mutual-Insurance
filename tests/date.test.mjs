import test from "node:test";
import assert from "node:assert/strict";
import {localISODate,filterAppointments} from "../src/utils/date.js";
test("dates use local calendar fields, not UTC day rollover",()=>{
 const d=new Date(2026,9,18,23,55,0);
 assert.equal(localISODate(d),"2026-10-18");
});
test("appointment search, status and sorting are stable",()=>{
 const records=[
  {id:"a",customerName:"Clara",date:"2026-10-20",time:"12:00",status:"scheduled",department:"Claims"},
  {id:"b",customerName:"Abigail",date:"2026-10-18",time:"09:00",status:"checked_in",department:"Sales"},
  {id:"c",customerName:"Marvin",date:"2026-10-19",time:"14:00",status:"completed",department:"Claims"}
 ];
 assert.deepEqual(filterAppointments(records,{sort:"soonest"}).map(x=>x.id),["b","c","a"]);
 assert.deepEqual(filterAppointments(records,{sort:"latest"}).map(x=>x.id),["a","c","b"]);
 assert.deepEqual(filterAppointments(records,{sort:"customer"}).map(x=>x.id),["b","a","c"]);
 assert.deepEqual(filterAppointments(records,{query:"claims"}).map(x=>x.id),["c","a"]);
 assert.deepEqual(filterAppointments(records,{status:"checked_in"}).map(x=>x.id),["b"]);
});
