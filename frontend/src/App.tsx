import React, { useState } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { SihDemonstrationDashboard } from './components/SihDemonstrationDashboard';
import { GpsIntelligencePage } from './components/GpsIntelligencePage';
import { GpsRecoveryPage } from './components/GpsRecoveryPage';
import { DataPreviewPage } from './components/DataPreviewPage';
import { DeadReckoningPage } from './components/DeadReckoningPage';
import { GpsOutageSimulatorPage } from './components/GpsOutageSimulatorPage';
import { AiDrCorrectionPage } from './components/AiDrCorrectionPage';
import { SensorFusionPage } from './components/SensorFusionPage';
import { DashboardOverview } from './components/DashboardOverview';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('sih_demo');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Header */}
      <Header />

      {/* Main Content Body */}
      <div style={{ display: 'flex', flex: 1, height: 'calc(100vh - 67px)', overflow: 'hidden' }}>
        {/* Navigation Sidebar */}
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Viewport Content Area */}
        <main style={{
          flex: 1,
          padding: '24px',
          overflowY: 'auto',
          height: '100%'
        }}>
          {activeTab === 'sih_demo' && <SihDemonstrationDashboard />}
          {activeTab === 'overview' && <DashboardOverview onNavigateToTab={setActiveTab} />}
          {activeTab === 'gps_monitor' && <GpsIntelligencePage />}
          {activeTab === 'gps_recovery' && <GpsRecoveryPage />}
          {activeTab === 'data' && <DataPreviewPage />}
          {activeTab === 'dead_reckoning' && <DeadReckoningPage />}
          {activeTab === 'outage' && <GpsOutageSimulatorPage />}
          {activeTab === 'aidr_correction' && <AiDrCorrectionPage />}
          {activeTab === 'fusion' && <SensorFusionPage />}
        </main>
      </div>
    </div>
  );
};

export default App;
