import React,{useState}from'react';
import{Bot,CalendarDays,Database,FileCheck2,LayoutDashboard,Newspaper,Settings,Users}from'lucide-react';
import App from'../App';
import type{ActiveTab}from'../types';
import{MemberManagement}from'./MemberManagement';
import{PublishApproval}from'./PublishApproval';

type AdminPage=ActiveTab|'PUBLISH'|'MEMBERS';
const legacy:[ActiveTab,string,React.ReactNode][]=[
  ['HOME','Home dashboard',<LayoutDashboard/>],['NEWS','News 관리',<Newspaper/>],['EVENTS','Events',<CalendarDays/>],
  ['AI_WORKSPACE','AI Workspace',<Bot/>],['SOURCES','Sources',<Database/>],['SETTINGS','Settings',<Settings/>]
];
export function AdminConsole(){
  const[page,setPage]=useState<AdminPage>('HOME');
  const isLegacy=legacy.some(([id])=>id===page);
  return <div className="admin-shell admin-restored">
    <aside className="admin-sidebar">
      <a className="admin-logo" href="/">JSRD <span>NEWS</span><small>ADMIN</small></a>
      <nav>
        {legacy.map(([id,label,icon])=><button key={id} className={page===id?'active':''} onClick={()=>setPage(id)}>{icon}{label}</button>)}
        <div className="admin-nav-separator"/>
        <button className={page==='PUBLISH'?'active':''} onClick={()=>setPage('PUBLISH')}><FileCheck2/>퍼블리시 승인</button>
        <button className={page==='MEMBERS'?'active':''} onClick={()=>setPage('MEMBERS')}><Users/>회원 관리</button>
      </nav>
      <a href="/" className="reader-link"><Newspaper/>Reader 보기</a>
    </aside>
    <main className="admin-main admin-main-restored">
      {page==='PUBLISH'?<PublishApproval/>:page==='MEMBERS'?<MemberManagement/>:isLegacy?<App embedded controlledTab={page as ActiveTab} onActiveTabChange={tab=>setPage(tab)}/>:null}
    </main>
  </div>
}
