import type{AuthenticatedActor,ServerRole}from'./authz';
export interface AuthClaims{sub?:string;email?:string;role?:string;}
export function actorFromClaims(claims:AuthClaims|null|undefined):AuthenticatedActor|null{if(!claims?.sub)return null;const role:ServerRole=claims.role==='ADMIN'?'ADMIN':claims.role==='EDITOR'||claims.role==='REPORTER'?'EDITOR':'MEMBER';return{id:claims.sub,email:claims.email,role}}
export function assertTrustedRoleSource(claims:AuthClaims,profileRole?:ServerRole):ServerRole{if(profileRole)return profileRole;return claims.role==='ADMIN'?'ADMIN':claims.role==='EDITOR'||claims.role==='REPORTER'?'EDITOR':'MEMBER'}
