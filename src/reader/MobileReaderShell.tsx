import React,{ReactNode}from'react';
export function MobileReaderShell({children}:{children:ReactNode}){return <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)]"><main className="mx-auto max-w-3xl pb-12 pt-3">{children}</main></div>}
