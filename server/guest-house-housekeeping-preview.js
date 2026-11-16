/**
 * Read-only housekeeping board for a property. Caller must authenticate
 * property membership and provide property-scoped data; no guest PII.
 */
export function previewHousekeeping({propertyId, rooms, tasks}={}) {
  if(typeof propertyId!=="string"||!propertyId.trim()) throw new TypeError("invalid_property");
  if(!Array.isArray(rooms)||rooms.length>1000||!Array.isArray(tasks)||tasks.length>10000) throw new TypeError("invalid_rows");
  const roomIds=new Set();
  for(const room of rooms){
    if(!room||room.propertyId!==propertyId||typeof room.id!=="string"||!room.id.trim()||roomIds.has(room.id))
      throw new TypeError("invalid_room");
    roomIds.add(room.id);
  }
  const taskIds=new Set(), byStatus={pending:0,in_progress:0,completed:0}, byRoom=new Map([...roomIds].map(id=>[id,{pending:0,in_progress:0,completed:0}]));
  for(const task of tasks){
    if(!task||task.propertyId!==propertyId||typeof task.id!=="string"||!task.id.trim()||taskIds.has(task.id)||
       !roomIds.has(task.roomId)||!Object.hasOwn(byStatus,task.status)||
       !["cleaning","inspection","linen","maintenance"].includes(task.type)) throw new TypeError("invalid_task");
    taskIds.add(task.id);byStatus[task.status]++;byRoom.get(task.roomId)[task.status]++;
  }
  return Object.freeze({propertyId,previewOnly:true,totalRooms:rooms.length,totalTasks:tasks.length,
    byStatus:Object.freeze(byStatus),rooms:Object.freeze([...byRoom].map(([roomId,counts])=>
      Object.freeze({roomId,...counts})))});
}
