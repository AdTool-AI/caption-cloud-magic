// Keep an initial-create retry bound to the same signed-in actor, workspace and body.
// The server owns authorization, replay comparison and persistence; this cache is only a caller request ID.
export function plannerCreateRequestId(cache:Map<string,string>,userId:string,workspaceId:string,body:Record<string,unknown>,newId:()=>string=()=>crypto.randomUUID()):string{
 const key=JSON.stringify([userId,workspaceId,Object.keys(body).sort().map(k=>[k,body[k]])]);
 let id=cache.get(key);if(!id){id=newId();cache.set(key,id);}return id;
}
