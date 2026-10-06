export type ServerRole = 'MEMBER' | 'EDITOR' | 'ADMIN';
export interface AuthenticatedActor { id:string; role:ServerRole; email?:string; displayName?:string; status?:'ACTIVE'|'SUSPENDED'; }
export function requireRole(actor:AuthenticatedActor|null|undefined,roles:ServerRole[]):AuthenticatedActor{if(!actor)throw Object.assign(new Error('Authentication required'),{statusCode:401});if(actor.status==='SUSPENDED')throw Object.assign(new Error('Account suspended'),{statusCode:403});if(!roles.includes(actor.role))throw Object.assign(new Error('Forbidden'),{statusCode:403});return actor}
export const requireEditor=(actor:AuthenticatedActor|null|undefined)=>requireRole(actor,['EDITOR','ADMIN']);
export const requireAdmin=(actor:AuthenticatedActor|null|undefined)=>requireRole(actor,['ADMIN']);
export const canEditOwnedArticle=(actor:AuthenticatedActor,authorId:string)=>actor.role==='ADMIN'||(actor.role==='EDITOR'&&actor.id===authorId);
