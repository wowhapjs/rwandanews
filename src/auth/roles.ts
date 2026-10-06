export type AccountRole = 'MEMBER' | 'EDITOR' | 'ADMIN';
export type AppMode = 'reader' | 'reporter' | 'admin';
export interface UserProfile { id:string; email?:string; displayName?:string; avatarUrl?:string; role:AccountRole; provider?:string; status?:'ACTIVE'|'SUSPENDED'; }
const allowedModes:Record<AccountRole,AppMode[]>={MEMBER:['reader'],EDITOR:['reader','reporter'],ADMIN:['reader','reporter','admin']};
export const canUseMode=(role:AccountRole,mode:AppMode)=>allowedModes[role].includes(mode);
export const defaultModeFor=(role:AccountRole):AppMode=>role==='ADMIN'?'admin':role==='EDITOR'?'reporter':'reader';
export const canWriteArticles=(role:AccountRole)=>role==='EDITOR'||role==='ADMIN';
export const canManageNewsroom=(role:AccountRole)=>role==='ADMIN';
