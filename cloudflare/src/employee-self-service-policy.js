/** Employee self-service policy. Does not grant workspace permissions. */
export const staffPortalEnabled=env=>env?.THEBE_STAFF_PORTAL_ENABLED==="true";
const EMAIL=/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
export const staffEmail=value=>{
 const email=typeof value==="string"?value.trim().toLowerCase():"";
 return email.length<=254&&EMAIL.test(email)?email:null;
};
export const staffPasswordValid=value=>typeof value==="string"&&value.length>=12&&value.length<=128;
export const staffIdValid=value=>typeof value==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
export const staffUuidValid=value=>typeof value==="string"&&/^[a-f0-9-]{32,36}$/i.test(value);
export const staffTitle=value=>typeof value==="string"&&value.trim().length>=3&&value.trim().length<=160?value.trim():null;
export const staffNote=(value,max=500)=>typeof value==="string"&&value.length<=max?value.trim():null;
export function staffDueDate(value){
 if(value===null||value===""||value===undefined)return null;
 if(typeof value!=="string"||!DATE.test(value))return false;
 const date=new Date(value+"T00:00:00Z");
 return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===value?value:false;
}
const transitions=Object.freeze({
 employee:Object.freeze({assigned:Object.freeze({start:"in_progress"}),in_progress:Object.freeze({submit:"submitted"})}),
 manager:Object.freeze({submitted:Object.freeze({approve:"completed",return:"in_progress"})})
});
export function staffTaskTransition(kind,status,action){
 return transitions[kind]?.[status]?.[action]||null;
}
export function staffTaskInput(data){
 if(!data||typeof data!=="object"||Array.isArray(data))return null;
 const employeeId=typeof data.employeeId==="string"?data.employeeId:"";
 const title=staffTitle(data.title),detail=staffNote(data.detail||"",1500),dueDate=staffDueDate(data.dueDate);
 const priority=data.priority===undefined?2:Number(data.priority);
 if(!staffUuidValid(employeeId)||!title||detail===null||dueDate===false||!Number.isInteger(priority)||priority<1||priority>3)return null;
 return {employeeId,title,detail,dueDate,priority};
}
