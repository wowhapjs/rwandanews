import{getBrowserSupabase}from'./supabaseAuth';
export async function authFetch(input:RequestInfo|URL,init:RequestInit={}){const{data:{session}}=await getBrowserSupabase().auth.getSession();const headers=new Headers(init.headers||{});if(session?.access_token)headers.set('Authorization',`Bearer ${session.access_token}`);return fetch(input,{...init,headers})}
