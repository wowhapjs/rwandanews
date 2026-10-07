import React,{useEffect,useRef,useState}from'react';
import{CircleUserRound,FileText,Filter,Globe2,Home,LogIn,LogOut,Palette,PenLine,Settings,UserRound}from'lucide-react';
import type{PortalTheme}from'../types';
import type{UserProfile}from'../auth/roles';
const langs=[['original','Original'],['ko','한국어'],['en','English'],['rw','Kinyarwanda']] as const;
const themes:PortalTheme[]=['BLACK','BLUE','PINK','RAINBOW'];
export function ReaderControlDock({profile,onHome,onFilter,onWrite,language,onLanguageChange,theme,onThemeChange,onLogin,onLogout,onProfile,onMyPosts,onAdmin}:{profile:UserProfile|null;onHome:()=>void;onFilter:()=>void;onWrite?:()=>void;language:string;onLanguageChange:(v:string)=>void;theme:PortalTheme;onThemeChange:(v:PortalTheme)=>void;onLogin:()=>void;onLogout:()=>void;onProfile:()=>void;onMyPosts:()=>void;onAdmin:()=>void}){
  const[open,setOpen]=useState(false),ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{const close=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)};document.addEventListener('mousedown',close);return()=>document.removeEventListener('mousedown',close)},[]);
  const nextLang=()=>{const i=langs.findIndex(([v])=>v===language);onLanguageChange(langs[(i+1)%langs.length][0])};
  const nextTheme=()=>{const i=themes.indexOf(theme);onThemeChange(themes[(i+1)%themes.length])};
  const initial=(profile?.displayName||profile?.email||'JS').slice(0,2).toUpperCase();
  return <div ref={ref} className={`reader-dock ${open?'open':''}`}>
    {open&&<div className="reader-dock-panel" role="menu">
      <button title="홈" onClick={()=>{onHome();setOpen(false)}}><Home/><span>홈</span></button>
      <button title="필터" onClick={()=>{onFilter();setOpen(false)}}><Filter/><span>필터</span></button>
      <button title="기사쓰기" onClick={()=>{onWrite?.();setOpen(false)}}><PenLine/><span>쓰기</span></button>
      <button title={`언어: ${langs.find(([v])=>v===language)?.[1]||language}`} onClick={nextLang}><Globe2/><span>{String(language).toUpperCase()}</span></button>
      <button title={`스킨: ${theme}`} onClick={nextTheme}><Palette/><span>{theme.slice(0,2)}</span></button>
      {!profile?<button title="로그인" onClick={onLogin}><LogIn/><span>로그인</span></button>:<>
        <button title="회원정보" onClick={onProfile}><UserRound/><span>계정</span></button>
        <button title="내 글" onClick={onMyPosts}><FileText/><span>내 글</span></button>
        {profile.role==='ADMIN'&&<button title="관리자" onClick={onAdmin}><Settings/><span>관리</span></button>}
        <button title="로그아웃" onClick={onLogout}><LogOut/><span>로그아웃</span></button>
      </>}
    </div>}
    <button className="reader-dock-main" aria-label="JSRD 메뉴" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{profile?.avatarUrl?<img src={profile.avatarUrl} alt=""/>:profile?<span>{initial}</span>:<CircleUserRound/>}</button>
  </div>
}
