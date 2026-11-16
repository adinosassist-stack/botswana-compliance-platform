import test from "node:test";
import assert from "node:assert/strict";
import {previewHousekeeping} from "../server/guest-house-housekeeping-preview.js";
const rooms=[{id:"one",propertyId:"p"},{id:"two",propertyId:"p"}];
test("summarizes room cleaning and inspection tasks",()=>{
 const result=previewHousekeeping({propertyId:"p",rooms,tasks:[
  {id:"a",propertyId:"p",roomId:"one",type:"cleaning",status:"pending"},
  {id:"b",propertyId:"p",roomId:"one",type:"inspection",status:"completed"}
 ]});
 assert.equal(result.byStatus.pending,1);
 assert.equal(result.rooms[0].completed,1);
 assert.equal(result.totalRooms,2);
 assert.equal(result.previewOnly,true);
});
test("rejects cross-property and duplicate tasks",()=>{
 const t={id:"a",propertyId:"p",roomId:"one",type:"cleaning",status:"pending"};
 assert.throws(()=>previewHousekeeping({propertyId:"p",rooms,tasks:[{...t,propertyId:"other"}]}));
 assert.throws(()=>previewHousekeeping({propertyId:"p",rooms,tasks:[t,t]}));
 assert.throws(()=>previewHousekeeping({propertyId:"p",rooms,tasks:[{...t,roomId:"unknown"}]}));
});
