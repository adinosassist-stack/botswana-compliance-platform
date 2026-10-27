// A click-to-chat POP handoff only. No receipt intake or bank verification.
export function popWhatsAppLink({phone,orderId}={}){
 const digits=String(phone||"").replace(/[ +()-]/g,"");
 if(!/^[1-9][0-9]{7,14}$/.test(digits))return null;
 const order=String(orderId||"");
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(order))return null;
 const message="Thebe Desk payment proof for order "+order+". I will attach my POP. This is not proof of cleared funds; please verify in the company bank account.";
 return "https://wa.me/"+digits+"?text="+encodeURIComponent(message);
}
