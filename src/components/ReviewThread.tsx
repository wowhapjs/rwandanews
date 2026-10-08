import React,{useEffect,useState}from'react';
import{MessageCircle,Send}from'lucide-react';
import{authFetch}from'../auth/authFetch';

type ThreadItem={id:number|string;action:string;message:string;actorId?:string;actorName:string;actorRole:string;createdAt:string};

export function ReviewThread({articleId,defaultOpen=false}:{articleId:string;defaultOpen?:boolean}){
 const[open,setOpen]=useState(defaultOpen),[items,setItems]=useState<ThreadItem[]>([]),[message,setMessage]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const load=async()=>{setLoading(true);try{const r=await authFetch(`/api/reporter/${encodeURIComponent(articleId)}/comments`,{cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error(d.error||'의견을 불러오지 못했습니다.');setItems(d.comments||[]);setError('')}catch(e){setError(e instanceof Error?e.message:'의견을 불러오지 못했습니다.')}finally{setLoading(false)}};
 useEffect(()=>{if(open)void load()},[open,articleId]);
 const send=async()=>{const text=message.trim();if(!text)return;setLoading(true);try{const r=await authFetch(`/api/reporter/${encodeURIComponent(articleId)}/comments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text})}),d=await r.json();if(!r.ok)throw new Error(d.error||'의견 전송 실패');setMessage('');await load()}catch(e){setError(e instanceof Error?e.message:'의견 전송 실패');setLoading(false)}};
 return <section className="review-thread"><button type="button" className="review-thread-toggle" onClick={()=>setOpen(v=>!v)}><MessageCircle/>{open?'의견 스레드 닫기':`관리자 의견 · 의견 스레드${items.length?` (${items.length})`:''}`}</button>{open&&<div className="review-thread-panel">{loading&&items.length===0&&<p className="muted">의견을 불러오는 중…</p>}{error&&<p className="admin-error">{error}</p>}<div className="review-thread-list">{items.map(x=><article className={`review-thread-item ${x.actorRole==='ADMIN'?'admin':'editor'}`} key={x.id}><div><strong>{x.actorName}</strong><span>{x.actorRole==='ADMIN'?'관리자':'에디터'} · {new Date(x.createdAt).toLocaleString()}</span></div><p>{x.message}</p></article>)}{!loading&&items.length===0&&<p className="muted">아직 의견이 없습니다.</p>}</div><div className="review-thread-compose"><textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="의견을 입력하세요." maxLength={2000}/><button type="button" className="primary-button" disabled={loading||!message.trim()} onClick={()=>void send()}><Send/>의견 보내기</button></div></div>}</section>;
}
