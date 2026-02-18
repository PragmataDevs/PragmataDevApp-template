import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function AppLayout() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen w-full bg-[color:var(--pragmata-bg)] overflow-hidden">
      
      {/* Sidebar Component */}
      <Sidebar 
        isOpen={isSidebarOpen} 
        isCollapsed={isSidebarCollapsed}
        onClose={() => setSidebarOpen(false)} 
        onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        
        {/* Header Component */}
        <Header onMenuClick={() => setSidebarOpen(true)} />

        {/* Scrollable Content */}
        <main className="flex-1 overflow-auto bg-[color:var(--pragmata-bg)] scroll-smooth">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
