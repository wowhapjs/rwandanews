import React, { ReactNode } from 'react';

export function MobileReaderShell({ children, onSearch }: { children: ReactNode; onSearch?: () => void }) {
  return <div className="min-h-screen bg-white text-slate-950"><header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur"><div className="mx-auto flex min-h-14 max-w-3xl items-center justify-between px-4"><strong className="tracking-tight">JSRD NEWS</strong><button type="button" onClick={onSearch} className="min-h-11 rounded-lg px-3 text-sm font-semibold">검색</button></div></header><main className="mx-auto max-w-3xl pb-20">{children}</main><nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 px-4 pb-[env(safe-area-inset-bottom)]"><div className="mx-auto grid min-h-14 max-w-md grid-cols-3 items-center text-center text-sm font-semibold"><span>홈</span><span>최신</span><span>검색</span></div></nav></div>;
}
