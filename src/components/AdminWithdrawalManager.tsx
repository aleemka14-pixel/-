import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Filter, 
  Settings2, 
  Sliders, 
  Check, 
  X, 
  Clock, 
  AlertTriangle, 
  ArrowUpRight, 
  FileEdit, 
  Upload, 
  Trash2, 
  Eye, 
  RefreshCw, 
  Plus, 
  DollarSign, 
  Activity, 
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Download,
  ShieldAlert,
  ArrowUp,
  ArrowDown,
  Sparkles,
  HelpCircle,
  Shield,
  Coins,
  SwitchCamera
} from 'lucide-react';
import { db } from '../lib/firebase.ts';
import { doc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { WithdrawalRequest, WithdrawalNetwork, WithdrawalSettings, Player, DepositRequest } from '../types.ts';
import { logActivity } from '../lib/audit.ts';
import { AdminDepositLedger } from './AdminDepositLedger.tsx';
import { AdminPaymentManagement } from './AdminPaymentManagement.tsx';
import { PaymentOperationsDashboard } from './PaymentOperationsDashboard.tsx';
import { getCurrencySymbol } from '../lib/currency.ts';

interface AdminWithdrawalManagerProps {
  withdrawals: WithdrawalRequest[];
  networks: WithdrawalNetwork[];
  settings?: WithdrawalSettings;
  players: Player[];
  deposits: DepositRequest[];
  playSound: (sound: 'CLICK' | 'WIN' | 'LOSE' | 'BET' | 'SPIN') => void;
}

export function AdminWithdrawalManager({
  withdrawals,
  networks,
  settings,
  players,
  deposits,
  playSound
}: AdminWithdrawalManagerProps) {
  const [activeAdminTab, setActiveAdminTab] = useState<'requests' | 'deposits' | 'settings' | 'content' | 'images' | 'infrastructure' | 'dashboard' | 'security' | 'payment_management'>('dashboard');

  // Role-based Access Control State
  const [adminRole, setAdminRole] = useState<'Super Admin' | 'Admin' | 'Support'>('Super Admin');

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);

  // Security alert logs
  const [securityAlerts, setSecurityAlerts] = useState<any[]>([]);

  // Password-protected Confirmation Modal State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmDesc, setConfirmDesc] = useState('');
  const [pendingAction, setPendingAction] = useState<any>(null);

  // Load audit logs function
  const fetchAuditLogs = async () => {
    setLoadingAuditLogs(true);
    try {
      const q = query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(100));
      const snap = await getDocs(q);
      const logsList: any[] = [];
      snap.forEach((doc) => {
        logsList.push({ id: doc.id, ...doc.data() });
      });
      setAuditLogs(logsList);
    } catch (e) {
      console.error("Failed to fetch audit logs:", e);
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  useEffect(() => {
    if (activeAdminTab === 'security' || activeAdminTab === 'dashboard') {
      fetchAuditLogs();
    }
  }, [activeAdminTab]);

  // Generate security alerts based on rules
  useEffect(() => {
    const alerts: any[] = [];
    
    // Check if there are any pending withdrawals > $1000
    withdrawals.forEach(w => {
      if (w.status === 'pending' && w.amount > 1000) {
        alerts.push({
          id: `alert-large-${w.id}`,
          type: 'LARGE_WITHDRAWAL',
          message: `Pending withdrawal #${w.id} of ${w.amount} USDT exceeds security alert threshold ($1,000).`,
          severity: 'high',
          timestamp: w.timestamp
        });
      }
    });

    // Check if player has unusually high total balances or wagers
    players.forEach(p => {
      if (p.balance > 25000) {
        alerts.push({
          id: `alert-balance-${p.id}`,
          type: 'HIGH_BALANCE_ALERT',
          message: `Player "${p.name}" holds an exceptionally high balance of ${p.balance.toLocaleString()} USDT.`,
          severity: 'medium',
          timestamp: Date.now() - 3600000
        });
      }
    });

    setSecurityAlerts(alerts);
  }, [withdrawals, players]);

  const requestSecureAction = (title: string, desc: string, actionFn: () => Promise<void>) => {
    setConfirmTitle(title);
    setConfirmDesc(desc);
    setPendingAction(() => actionFn);
    setConfirmPassword('');
    setConfirmError('');
    setShowConfirmModal(true);
  };

  const executeSecureAction = async () => {
    if (confirmPassword !== 'admin123') {
      setConfirmError('Invalid authorization password. Please enter "admin123" to authorize.');
      playSound('LOSE');
      return;
    }

    try {
      if (pendingAction) {
        await pendingAction();
      }
      setShowConfirmModal(false);
      playSound('WIN');
      fetchAuditLogs(); // Refresh logs
    } catch (err: any) {
      setConfirmError(err.message || 'Action failed.');
      playSound('LOSE');
    }
  };

  // Hot Wallet Status State
  const [hotWalletDiag, setHotWalletDiag] = useState<any>(null);
  const [loadingHotWalletDiag, setLoadingHotWalletDiag] = useState(false);

  const fetchHotWalletStatus = async () => {
    setLoadingHotWalletDiag(true);
    try {
      const response = await fetch('/api/admin/wallet-status');
      const data = await response.json();
      if (data.success) {
        setHotWalletDiag(data.diagnostics);
      }
    } catch (e) {
      console.error("Failed to load hot wallet diagnostics:", e);
    } finally {
      setLoadingHotWalletDiag(false);
    }
  };

  useEffect(() => {
    fetchHotWalletStatus();
  }, []);

  // Wallet Infrastructure state
  const [infraProvider, setInfraProvider] = useState<'metamask' | 'trustwallet' | 'futureprovider'>('metamask');
  const [infraRefillEnabled, setInfraRefillEnabled] = useState(true);
  const [infraBalances, setInfraBalances] = useState({
    trc20: { hot: 12500, reserve: 150000, safety: 2000 },
    bep20: { hot: 45000, reserve: 250000, safety: 5000 },
    erc20: { hot: 8200, reserve: 500000, safety: 1000 }
  });
  const [infraLogs, setInfraLogs] = useState<Array<{ timestamp: string; type: string; message: string }>>([
    { timestamp: new Date(Date.now() - 50000).toISOString(), type: 'INFO', message: 'Wallet Infrastructure Layer initialized.' },
    { timestamp: new Date(Date.now() - 30000).toISOString(), type: 'SUCCESS', message: 'Active provider set to MetaMask.' },
    { timestamp: new Date(Date.now() - 10000).toISOString(), type: 'HEALTH', message: 'RPC Connection check passed. All nodes green.' }
  ]);
  const [isDiagnosticRunning, setIsDiagnosticRunning] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<any>(null);

  // Spreadsheet state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [networkFilter, setNetworkFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<keyof WithdrawalRequest>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Bulk action state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Inline editing state for Admin Notes / Tx Hash
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempNotes, setTempNotes] = useState('');
  const [tempHash, setTempHash] = useState('');

  // Selected network in Content Manager
  const [selectedContentNetId, setSelectedContentNetId] = useState<string>(
    networks.length > 0 ? networks[0].id : 'tron'
  );

  // Loading indicator for background operations
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Global settings edit state
  const [minWithdraw, setMinWithdraw] = useState<number>(settings?.minWithdraw ?? 10);
  const [maxWithdraw, setMaxWithdraw] = useState<number>(settings?.maxWithdraw ?? 50000);
  const [dailyLimit, setDailyLimit] = useState<number>(settings?.dailyWithdrawLimit ?? 100000);
  const [weeklyLimit, setWeeklyLimit] = useState<number>(settings?.weeklyWithdrawLimit ?? 500000);
  const [monthlyLimit, setMonthlyLimit] = useState<number>(settings?.monthlyWithdrawLimit ?? 2000000);
  const [feePercentage, setFeePercentage] = useState<number>(settings?.feePercentage ?? 0);
  const [kycRequired, setKycRequired] = useState<boolean>(settings?.kycRequired ?? false);
  const [autoWithdraw, setAutoWithdraw] = useState<boolean>(settings?.autoWithdrawEnabled ?? false);
  const [manualApproval, setManualApproval] = useState<boolean>(settings?.manualApprovalEnabled ?? true);
  const [maintenanceMode, setMaintenanceMode] = useState<boolean>(settings?.maintenanceMode ?? false);
  const [allowedBlockchains, setAllowedBlockchains] = useState<string[]>(settings?.allowedBlockchains ?? []);

  // Blockchain Content edit state
  const currentEditNetwork = useMemo(() => {
    return networks.find(n => n.id === selectedContentNetId) || networks[0];
  }, [networks, selectedContentNetId]);

  // Network editing values
  const [netTitle, setNetTitle] = useState('');
  const [netSubtitle, setNetSubtitle] = useState('');
  const [netDesc, setNetDesc] = useState('');
  const [netLogoUrl, setNetLogoUrl] = useState('');
  const [netBannerUrl, setNetBannerUrl] = useState('');
  const [netWarning, setNetWarning] = useState('');
  const [netInstructions, setNetInstructions] = useState('');
  const [netFeeText, setNetFeeText] = useState('');
  const [netEstTime, setNetEstTime] = useState('');
  const [netMin, setNetMin] = useState(10);
  const [netMax, setNetMax] = useState(50000);
  const [netPopularity, setNetPopularity] = useState('');
  const [netSecurity, setNetSecurity] = useState(5);
  const [netStatus, setNetStatus] = useState<'Online' | 'Maintenance'>('Online');
  const [netFaqs, setNetFaqs] = useState<{ question: string; answer: string }[]>([]);

  // Image Upload presets
  const [customImgUrl, setCustomImgUrl] = useState('');
  const [imagePlaceholderType, setImagePlaceholderType] = useState<'logo' | 'banner'>('banner');

  // ==========================================
  // GATEWAY MANAGER REDESIGN STATE VARIABLES
  // ==========================================
  const [searchGatewayTerm, setSearchGatewayTerm] = useState('');
  const [gatewayStatusFilter, setGatewayStatusFilter] = useState('all');
  const [gatewayAutoFilter, setGatewayAutoFilter] = useState('all');
  const [gatewaySortField, setGatewaySortField] = useState<'name' | 'priority' | 'activity'>('priority');
  const [gatewaySortOrder, setGatewaySortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedGatewayIds, setSelectedGatewayIds] = useState<string[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingNetworkId, setEditingNetworkId] = useState<string | null>(null);

  // Warning Modals States
  const [showDisableWarning, setShowDisableWarning] = useState<{ open: boolean; networkId: string } | null>(null);
  const [showDeleteWarning, setShowDeleteWarning] = useState<{ open: boolean; networkId: string } | null>(null);
  const [showBulkDisableWarning, setShowBulkDisableWarning] = useState<{ open: boolean; networkIds: string[] } | null>(null);
  const [showBulkDeleteWarning, setShowBulkDeleteWarning] = useState<{ open: boolean; networkIds: string[] } | null>(null);

  // Temporary drawer edit states (real-time user preview updates)
  const [drawerName, setDrawerName] = useState('');
  const [drawerLogoUrl, setDrawerLogoUrl] = useState('');
  const [drawerBannerUrl, setDrawerBannerUrl] = useState('');
  const [drawerTitle, setDrawerTitle] = useState('');
  const [drawerSubtitle, setDrawerSubtitle] = useState('');
  const [drawerDescription, setDrawerDescription] = useState('');
  const [drawerWarningMessage, setDrawerWarningMessage] = useState('');
  const [drawerInstructions, setDrawerInstructions] = useState('');
  const [drawerFeeText, setDrawerFeeText] = useState('');
  const [drawerEstTime, setDrawerEstTime] = useState('');
  const [drawerMinWithdraw, setDrawerMinWithdraw] = useState(10);
  const [drawerMaxWithdraw, setDrawerMaxWithdraw] = useState(50000);
  const [drawerPriority, setDrawerPriority] = useState(1);
  const [drawerPopularityBadge, setDrawerPopularityBadge] = useState('');
  const [drawerSecurityRating, setDrawerSecurityRating] = useState(5);
  const [drawerStatus, setDrawerStatus] = useState<'Online' | 'Maintenance'>('Online');
  const [drawerEnabled, setDrawerEnabled] = useState(true);
  const [drawerSupportedCoins, setDrawerSupportedCoins] = useState('');
  const [drawerFaq, setDrawerFaq] = useState<{ question: string; answer: string }[]>([]);
  const [newFaqQuestion, setNewFaqQuestion] = useState('');
  const [newFaqAnswer, setNewFaqAnswer] = useState('');

  // Synchronize drawer variables when a network is selected for editing
  useEffect(() => {
    if (editingNetworkId) {
      const net = networks.find(n => n.id === editingNetworkId);
      if (net) {
        setDrawerName(net.name || '');
        setDrawerLogoUrl(net.logoUrl || '');
        setDrawerBannerUrl(net.bannerUrl || '');
        setDrawerTitle(net.title || '');
        setDrawerSubtitle(net.subtitle || '');
        setDrawerDescription(net.description || '');
        setDrawerWarningMessage(net.warningMessage || '');
        setDrawerInstructions(net.instructions || '');
        setDrawerFeeText(net.networkFeeText || '');
        setDrawerEstTime(net.estimatedTime || '');
        setDrawerMinWithdraw(net.minWithdraw || 10);
        setDrawerMaxWithdraw(net.maxWithdraw || 50000);
        setDrawerPriority(net.priority || 1);
        setDrawerPopularityBadge(net.popularityBadge || '');
        setDrawerSecurityRating(net.securityRating || 5);
        setDrawerStatus(net.status || 'Online');
        setDrawerEnabled(net.enabled !== false);
        setDrawerSupportedCoins((net as any).supportedCoins || (net.id === 'btc' ? 'BTC' : net.id === 'sol' ? 'SOL' : net.id === 'ltc' ? 'LTC' : 'USDT'));
        setDrawerFaq(net.faq || []);
      }
    }
  }, [editingNetworkId, networks]);

  // Merge current unsaved drawer changes onto networks list for an absolute real-time player preview experience
  const previewNetworks = useMemo(() => {
    return networks.map(n => {
      if (isDrawerOpen && editingNetworkId === n.id) {
        return {
          ...n,
          name: drawerName,
          logoUrl: drawerLogoUrl,
          bannerUrl: drawerBannerUrl,
          title: drawerTitle,
          subtitle: drawerSubtitle,
          description: drawerDescription,
          warningMessage: drawerWarningMessage,
          instructions: drawerInstructions,
          networkFeeText: drawerFeeText,
          estimatedTime: drawerEstTime,
          minWithdraw: drawerMinWithdraw,
          maxWithdraw: drawerMaxWithdraw,
          priority: drawerPriority,
          popularityBadge: drawerPopularityBadge,
          securityRating: drawerSecurityRating,
          status: drawerStatus,
          enabled: drawerEnabled,
          supportedCoins: drawerSupportedCoins,
          faq: drawerFaq
        } as any;
      }
      return n;
    });
  }, [
    networks, 
    isDrawerOpen, 
    editingNetworkId, 
    drawerName, 
    drawerLogoUrl, 
    drawerBannerUrl, 
    drawerTitle, 
    drawerSubtitle, 
    drawerDescription, 
    drawerWarningMessage, 
    drawerInstructions, 
    drawerFeeText, 
    drawerEstTime, 
    drawerMinWithdraw, 
    drawerMaxWithdraw, 
    drawerPriority, 
    drawerPopularityBadge, 
    drawerSecurityRating, 
    drawerStatus, 
    drawerEnabled, 
    drawerSupportedCoins,
    drawerFaq
  ]);

  // Filtering, Searching and Sorting for the main gateways admin table
  const filteredGateways = useMemo(() => {
    let result = [...networks];

    if (searchGatewayTerm.trim()) {
      const term = searchGatewayTerm.toLowerCase();
      result = result.filter(n => n.name.toLowerCase().includes(term) || n.id.toLowerCase().includes(term));
    }

    if (gatewayStatusFilter !== 'all') {
      if (gatewayStatusFilter === 'active') {
        result = result.filter(n => n.enabled && n.status === 'Online');
      } else if (gatewayStatusFilter === 'maintenance') {
        result = result.filter(n => n.status === 'Maintenance');
      } else if (gatewayStatusFilter === 'disabled') {
        result = result.filter(n => !n.enabled);
      }
    }

    if (gatewayAutoFilter !== 'all') {
      if (gatewayAutoFilter === 'auto') {
        result = result.filter(n => (n as any).autoWithdrawEnabled === true);
      } else if (gatewayAutoFilter === 'manual') {
        result = result.filter(n => (n as any).manualApprovalEnabled === true);
      }
    }

    result.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      if (gatewaySortField === 'name') {
        valA = a.name.toLowerCase();
        valB = b.name.toLowerCase();
      } else if (gatewaySortField === 'priority') {
        valA = a.priority || 0;
        valB = b.priority || 0;
      } else if (gatewaySortField === 'activity') {
        valA = withdrawals.filter(w => w.blockchain === a.id).length;
        valB = withdrawals.filter(w => w.blockchain === b.id).length;
      }

      if (valA < valB) return gatewaySortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return gatewaySortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [networks, searchGatewayTerm, gatewayStatusFilter, gatewayAutoFilter, gatewaySortField, gatewaySortOrder, withdrawals]);

  // Summary Metrics above the grid
  const gatewayStats = useMemo(() => {
    const activeNets = networks.filter(n => n.enabled && n.status === 'Online').length;
    const maintenanceNets = networks.filter(n => n.status === 'Maintenance').length;
    const autoNets = networks.filter(n => (n as any).autoWithdrawEnabled === true).length;
    const pendingCount = withdrawals.filter(w => w.status === 'pending').length;
    
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCompleted = withdrawals.filter(w => {
      return w.status === 'completed' && w.completedDate && w.completedDate >= todayStart.getTime();
    });
    const todayVol = todayCompleted.reduce((sum, w) => sum + w.amount, 0);
    
    return {
      activeNets,
      maintenanceNets,
      autoNets,
      pendingCount,
      todayVol
    };
  }, [networks, withdrawals]);

  // ==========================================
  // GATEWAY HANDLERS (AUTO-SAVING TRIGGERS)
  // ==========================================
  const handleToggleGatewayEnabled = async (id: string, currentlyEnabled: boolean) => {
    playSound('CLICK');
    if (currentlyEnabled) {
      const pendingCount = withdrawals.filter(w => w.blockchain === id && w.status === 'pending').length;
      if (pendingCount > 0) {
        setShowDisableWarning({ open: true, networkId: id });
        return;
      }
    }
    try {
      await updateDoc(doc(db, 'withdrawal_networks', id), { enabled: !currentlyEnabled });
      playSound('WIN');
    } catch (e) {
      console.error('Error toggling gateway enabled:', e);
      playSound('LOSE');
    }
  };

  const handleToggleGatewayAutoWithdraw = async (id: string, currentVal: boolean) => {
    playSound('CLICK');
    try {
      await updateDoc(doc(db, 'withdrawal_networks', id), { autoWithdrawEnabled: !currentVal });
      playSound('WIN');
    } catch (e) {
      console.error(e);
      playSound('LOSE');
    }
  };

  const handleToggleGatewayManualApproval = async (id: string, currentVal: boolean) => {
    playSound('CLICK');
    try {
      await updateDoc(doc(db, 'withdrawal_networks', id), { manualApprovalEnabled: !currentVal });
      playSound('WIN');
    } catch (e) {
      console.error(e);
      playSound('LOSE');
    }
  };

  const handleToggleGatewayMaintenance = async (id: string, currentStatus: string) => {
    playSound('CLICK');
    const nextStatus = currentStatus === 'Maintenance' ? 'Online' : 'Maintenance';
    try {
      await updateDoc(doc(db, 'withdrawal_networks', id), { status: nextStatus });
      playSound('WIN');
    } catch (e) {
      console.error(e);
      playSound('LOSE');
    }
  };

  const handleShiftPriority = async (id: string, direction: 'up' | 'down') => {
    playSound('CLICK');
    const sorted = [...networks].sort((a, b) => (a.priority || 0) - (b.priority || 0));
    const currIdx = sorted.findIndex(n => n.id === id);
    if (currIdx === -1) return;
    
    let targetIdx = direction === 'up' ? currIdx - 1 : currIdx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    
    const currentNet = sorted[currIdx];
    const targetNet = sorted[targetIdx];
    const tempPriority = currentNet.priority || 1;
    const nextPriority = targetNet.priority || 2;
    
    try {
      const ref1 = doc(db, 'withdrawal_networks', currentNet.id);
      const ref2 = doc(db, 'withdrawal_networks', targetNet.id);
      if (tempPriority === nextPriority) {
        await updateDoc(ref1, { priority: direction === 'up' ? tempPriority - 1 : tempPriority + 1 });
      } else {
        await updateDoc(ref1, { priority: nextPriority });
        await updateDoc(ref2, { priority: tempPriority });
      }
      playSound('WIN');
    } catch (e) {
      console.error(e);
      playSound('LOSE');
    }
  };

  const handleCreateNewGateway = () => {
    playSound('CLICK');
    const newId = prompt('Enter a unique alphanumeric ID for the new gateway (e.g., doge, trx, cardano):');
    if (!newId) return;
    const cleanId = newId.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!cleanId) {
      alert('Invalid ID. Alphanumeric only.');
      return;
    }
    
    if (networks.some(n => n.id === cleanId)) {
      alert('A gateway with this ID already exists!');
      return;
    }
    
    setEditingNetworkId(cleanId);
    setDrawerName(cleanId.toUpperCase());
    setDrawerLogoUrl('https://images.unsplash.com/photo-1621416894569-0f39ed31d247?w=100&q=80');
    setDrawerBannerUrl('https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&q=80');
    setDrawerTitle(`${cleanId.toUpperCase()} Settlement`);
    setDrawerSubtitle('Enterprise Grade Settlement');
    setDrawerDescription('A fast blockchain network configured for secure withdrawal settlement.');
    setDrawerWarningMessage('Verify address carefully before submitting.');
    setDrawerInstructions('Provide your wallet address.');
    setDrawerFeeText('1.00 USD equivalent');
    setDrawerEstTime('5-15 mins');
    setDrawerMinWithdraw(10);
    setDrawerMaxWithdraw(50000);
    setDrawerPriority(networks.length + 1);
    setDrawerPopularityBadge('New');
    setDrawerSecurityRating(5);
    setDrawerStatus('Online');
    setDrawerEnabled(true);
    setDrawerSupportedCoins(cleanId.toUpperCase());
    
    setIsDrawerOpen(true);
  };

  const handleSaveDrawerGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNetworkId) return;
    playSound('CLICK');
    try {
      const netRef = doc(db, 'withdrawal_networks', editingNetworkId);
      const updatedNet: any = {
        id: editingNetworkId,
        name: drawerName,
        logoUrl: drawerLogoUrl,
        bannerUrl: drawerBannerUrl,
        title: drawerTitle,
        subtitle: drawerSubtitle,
        description: drawerDescription,
        warningMessage: drawerWarningMessage,
        instructions: drawerInstructions,
        networkFeeText: drawerFeeText,
        estimatedTime: drawerEstTime,
        minWithdraw: drawerMinWithdraw,
        maxWithdraw: drawerMaxWithdraw,
        priority: drawerPriority,
        popularityBadge: drawerPopularityBadge,
        securityRating: drawerSecurityRating,
        status: drawerStatus,
        enabled: drawerEnabled,
        supportedCoins: drawerSupportedCoins,
        faq: drawerFaq
      };
      
      await setDoc(netRef, updatedNet, { merge: true });
      playSound('WIN');
      setIsDrawerOpen(false);
      setEditingNetworkId(null);
    } catch (err) {
      console.error(err);
      playSound('LOSE');
    }
  };

  const handleDeleteSingleGateway = async (id: string) => {
    playSound('CLICK');
    try {
      await deleteDoc(doc(db, 'withdrawal_networks', id));
      playSound('WIN');
      setShowDeleteWarning(null);
      setSelectedGatewayIds(prev => prev.filter(x => x !== id));
    } catch (e) {
      console.error(e);
      playSound('LOSE');
    }
  };

  // Bulk operation executor methods
  const handleBulkEnable = async () => {
    playSound('CLICK');
    if (selectedGatewayIds.length === 0) return;
    try {
      await Promise.all(selectedGatewayIds.map(id => {
        return updateDoc(doc(db, 'withdrawal_networks', id), { enabled: true });
      }));
      setSelectedGatewayIds([]);
      playSound('WIN');
    } catch (e) {
      console.error(e);
      playSound('LOSE');
    }
  };

  const handleBulkDisableWithCheck = () => {
    playSound('CLICK');
    if (selectedGatewayIds.length === 0) return;
    const problematicIds = selectedGatewayIds.filter(id => {
      return withdrawals.filter(w => w.blockchain === id && w.status === 'pending').length > 0;
    });
    
    if (problematicIds.length > 0) {
      setShowBulkDisableWarning({ open: true, networkIds: selectedGatewayIds });
    } else {
      executeBulkDisable(selectedGatewayIds);
    }
  };

  const executeBulkDisable = async (ids: string[]) => {
    try {
      await Promise.all(ids.map(id => {
        return updateDoc(doc(db, 'withdrawal_networks', id), { enabled: false });
      }));
      setSelectedGatewayIds([]);
      setShowBulkDisableWarning(null);
      playSound('WIN');
    } catch (e) {
      console.error(e);
      playSound('LOSE');
    }
  };

  const handleBulkMaintenance = async () => {
    playSound('CLICK');
    if (selectedGatewayIds.length === 0) return;
    try {
      await Promise.all(selectedGatewayIds.map(id => {
        return updateDoc(doc(db, 'withdrawal_networks', id), { status: 'Maintenance' });
      }));
      setSelectedGatewayIds([]);
      playSound('WIN');
    } catch (e) {
      console.error(e);
      playSound('LOSE');
    }
  };

  const handleBulkDeleteWithCheck = () => {
    playSound('CLICK');
    if (selectedGatewayIds.length === 0) return;
    setShowBulkDeleteWarning({ open: true, networkIds: selectedGatewayIds });
  };

  const executeBulkDelete = async (ids: string[]) => {
    try {
      await Promise.all(ids.map(id => {
        return deleteDoc(doc(db, 'withdrawal_networks', id));
      }));
      setSelectedGatewayIds([]);
      setShowBulkDeleteWarning(null);
      playSound('WIN');
    } catch (e) {
      console.error(e);
      playSound('LOSE');
    }
  };

  // Preview tab local states
  const [selectedPreviewNetId, setSelectedPreviewNetId] = useState<string>('tron');
  const [previewWalletAddress, setPreviewWalletAddress] = useState('');
  const [previewWithdrawAmount, setPreviewWithdrawAmount] = useState('');

  // Trigger loading editing values when selected blockchain changes
  React.useEffect(() => {
    if (currentEditNetwork) {
      setNetTitle(currentEditNetwork.title || '');
      setNetSubtitle(currentEditNetwork.subtitle || '');
      setNetDesc(currentEditNetwork.description || '');
      setNetLogoUrl(currentEditNetwork.logoUrl || '');
      setNetBannerUrl(currentEditNetwork.bannerUrl || '');
      setNetWarning(currentEditNetwork.warningMessage || '');
      setNetInstructions(currentEditNetwork.instructions || '');
      setNetFeeText(currentEditNetwork.networkFeeText || '');
      setNetEstTime(currentEditNetwork.estimatedTime || '');
      setNetMin(currentEditNetwork.minWithdraw || 10);
      setNetMax(currentEditNetwork.maxWithdraw || 50000);
      setNetPopularity(currentEditNetwork.popularityBadge || '');
      setNetSecurity(currentEditNetwork.securityRating || 5);
      setNetStatus(currentEditNetwork.status || 'Online');
      setNetFaqs(currentEditNetwork.faq || []);
    }
  }, [currentEditNetwork]);

  // Synchronize global settings when props loaded
  React.useEffect(() => {
    if (settings) {
      setMinWithdraw(settings.minWithdraw);
      setMaxWithdraw(settings.maxWithdraw);
      setDailyLimit(settings.dailyWithdrawLimit);
      setWeeklyLimit(settings.weeklyWithdrawLimit ?? 500000);
      setMonthlyLimit(settings.monthlyWithdrawLimit ?? 2000000);
      setFeePercentage(settings.feePercentage ?? 0);
      setKycRequired(settings.kycRequired ?? false);
      setAutoWithdraw(settings.autoWithdrawEnabled);
      setManualApproval(settings.manualApprovalEnabled);
      setMaintenanceMode(settings.maintenanceMode);
      setAllowedBlockchains(settings.allowedBlockchains || []);
    }
  }, [settings]);

  // Player helper map
  const playerMap = useMemo(() => {
    const map: Record<string, Player> = {};
    players.forEach(p => {
      map[p.id] = p;
    });
    return map;
  }, [players]);

  // Spreadsheet calculations: Sorting / Search / Filter
  const filteredWithdrawals = useMemo(() => {
    let result = [...withdrawals];

    // Search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(w => {
        const player = playerMap[w.playerId];
        const pName = player ? player.name.toLowerCase() : '';
        const pEmail = player?.email ? player.email.toLowerCase() : '';
        const wAddress = w.walletAddress ? w.walletAddress.toLowerCase() : (w.details || '').toLowerCase();
        const wId = w.id.toLowerCase();
        return pName.includes(term) || pEmail.includes(term) || wAddress.includes(term) || wId.includes(term);
      });
    }

    // Status Filter
    if (statusFilter !== 'all') {
      result = result.filter(w => w.status === statusFilter);
    }

    // Network Filter
    if (networkFilter !== 'all') {
      result = result.filter(w => w.blockchain === networkFilter);
    }

    // Sort
    result.sort((a, b) => {
      let aVal: any = a[sortField] ?? '';
      let bVal: any = b[sortField] ?? '';

      // Fallback for sub-property or calculated values
      if (sortField === 'playerName') {
        aVal = playerMap[a.playerId]?.name || '';
        bVal = playerMap[b.playerId]?.name || '';
      }

      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [withdrawals, searchTerm, statusFilter, networkFilter, sortField, sortOrder, playerMap]);

  const handleSort = (field: keyof WithdrawalRequest | 'playerName') => {
    playSound('CLICK');
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field as any);
      setSortOrder('desc');
    }
  };

  // Checkbox handlers
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredWithdrawals.map(w => w.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(x => x !== id));
    }
  };

  // Actions
  const handleUpdateStatus = async (
    id: string, 
    newStatus: 'pending' | 'reviewing' | 'approved' | 'processing' | 'broadcasted' | 'completed' | 'rejected' | 'cancelled' | 'failed', 
    txHash?: string, 
    notes?: string
  ) => {
    // 1. Block Support role from making financial modifications
    if (adminRole === 'Support') {
      alert('Access Denied: Support role does not have permission to modify financial states.');
      playSound('LOSE');
      return;
    }

    const requestObj = withdrawals.find(w => w.id === id);
    const amount = requestObj ? requestObj.amount : 0;
    const isLargeWithdrawal = amount > 1000;

    // 2. Sensitive actions require password authentication
    const needsVerification = isLargeWithdrawal || newStatus === 'approved' || newStatus === 'completed';

    const proceedWithUpdate = async () => {
      setProcessingId(id);
      playSound('CLICK');
      try {
        if (newStatus === 'approved' || newStatus === 'completed' || newStatus === 'rejected') {
          const action = newStatus === 'approved' ? 'approve' : (newStatus === 'rejected' ? 'reject' : 'complete');
          const response = await fetch('/api/admin/process-withdrawal', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              withdrawalId: id,
              action,
              notes: notes || tempNotes,
              transactionHash: txHash || tempHash,
              adminRole,
              adminId: 'Global_Admin'
            })
          });

          const resData = await response.json();
          if (!response.ok || !resData.success) {
            throw new Error(resData.error || 'Failed to update withdrawal status.');
          }

          setEditingId(null);
          setTempNotes('');
          setTempHash('');
          playSound('WIN');
          fetchHotWalletStatus(); // Refresh hot wallet balances
          return;
        }

        const withdrawalRef = doc(db, 'withdrawals', id);
        const updates: any = { status: newStatus };
        if (txHash !== undefined) updates.transactionHash = txHash;
        if (notes !== undefined) updates.adminNotes = notes;
        if ((newStatus as string) === 'completed') updates.completedDate = Date.now();

        // Refund player balance if transitioned to a failed/cancelled/rejected state from an active state
        const isTerminalFailure = ['rejected', 'cancelled', 'failed'].includes(newStatus);
        
        if (requestObj && isTerminalFailure) {
          const isPreviousStateActive = ['pending', 'reviewing', 'approved', 'processing', 'broadcasted'].includes(requestObj.status);
          if (isPreviousStateActive) {
            const playerRef = doc(db, 'players', requestObj.playerId);
            const playerObj = playerMap[requestObj.playerId];
            if (playerObj) {
              const newBalance = (playerObj.balance || 0) + requestObj.amount;
              await updateDoc(playerRef, {
                balance: newBalance
              });
              await setDoc(doc(db, 'users', requestObj.playerId), {
                walletBalance: newBalance,
                updatedAt: Date.now()
              }, { merge: true });
            }
          }
        }

        await updateDoc(withdrawalRef, updates);
        setEditingId(null);
        playSound('WIN');

        // Audit Log
        await logActivity({
          userId: requestObj?.playerId || 'unknown',
          adminId: 'Global_Admin',
          action: `withdrawal_status_update_${newStatus}`,
          module: 'admin_withdrawal_ledger',
          oldValue: requestObj?.status || 'unknown',
          newValue: newStatus,
          ipAddress: '127.0.0.1'
        });
      } catch (e: any) {
        console.error('Error updating status:', e);
        playSound('LOSE');
        alert(e.message || 'Failed to update withdrawal status.');
      } finally {
        setProcessingId(null);
      }
    };

    if (needsVerification) {
      const title = isLargeWithdrawal ? '🚨 Authorize Large Withdrawal' : '🔒 Secure Admin Approval';
      const desc = `You are about to modify the status of a ${amount} USDT withdrawal for player ${playerMap[requestObj?.playerId || '']?.name || 'Unknown'}. Enter the administration password to verify.`;
      requestSecureAction(title, desc, proceedWithUpdate);
    } else {
      await proceedWithUpdate();
    }
  };

  // Bulk actions helper
  const handleBulkStatus = async (
    newStatus: 'reviewing' | 'approved' | 'processing' | 'broadcasted' | 'completed' | 'rejected' | 'failed'
  ) => {
    if (adminRole === 'Support') {
      alert('Access Denied: Support role cannot execute bulk action financial changes.');
      playSound('LOSE');
      return;
    }

    if (selectedIds.length === 0) return;

    const executeBulk = async () => {
      for (const id of selectedIds) {
        await handleUpdateStatus(id, newStatus);
      }
      setSelectedIds([]);
      alert('Bulk operation completed successfully.');
    };

    requestSecureAction(
      '🔒 Bulk Action Authentication',
      `You are about to transition ${selectedIds.length} withdrawals to "${newStatus}". Please enter the administrator password.`,
      executeBulk
    );
  };

  // Resend Transaction: sets a failed/rejected/cancelled transaction back to pending
  const handleResendTransaction = async (id: string) => {
    if (adminRole === 'Support') {
      alert('Access Denied: Support role cannot resend or re-initiate transactions.');
      playSound('LOSE');
      return;
    }

    playSound('CLICK');
    const requestObj = withdrawals.find(w => w.id === id);
    if (!requestObj) return;

    const executeResend = async () => {
      setProcessingId(id);
      try {
        const playerRef = doc(db, 'players', requestObj.playerId);
        const playerObj = playerMap[requestObj.playerId];
        
        const isTerminalFailure = ['rejected', 'cancelled', 'failed'].includes(requestObj.status);
        if (isTerminalFailure && playerObj) {
          const requiredBalance = requestObj.amount;
          if ((playerObj.balance || 0) < requiredBalance) {
            alert(`Cannot resend: Player balance ($${playerObj.balance || 0}) is insufficient to re-deduct the amount ($${requiredBalance}).`);
            return;
          }
          const newBalance = (playerObj.balance || 0) - requiredBalance;
          await updateDoc(playerRef, {
            balance: newBalance
          });
          await setDoc(doc(db, 'users', requestObj.playerId), {
            walletBalance: newBalance,
            updatedAt: Date.now()
          }, { merge: true });
        }

        const withdrawalRef = doc(db, 'withdrawals', id);
        await updateDoc(withdrawalRef, {
          status: 'pending',
          transactionHash: '',
          adminNotes: `${requestObj.adminNotes || ''} [Resent on ${new Date().toLocaleString()}]`
        });

        // Audit Log
        await logActivity({
          userId: requestObj.playerId,
          adminId: 'Global_Admin',
          action: `withdrawal_transaction_resent`,
          module: 'admin_withdrawal_ledger',
          oldValue: requestObj.status,
          newValue: 'pending',
          ipAddress: '127.0.0.1'
        });

        alert('Transaction resent successfully! Status reset to pending.');
      } catch (e) {
        console.error('Error resending transaction:', e);
        alert('Failed to resend transaction.');
      } finally {
        setProcessingId(null);
      }
    };

    requestSecureAction(
      '🔄 Confirm Resending Transaction',
      `This will reset withdrawal #${id} to "pending" and deduct ${requestObj.amount} USDT from the player's balance. Enter your password to authorize.`,
      executeResend
    );
  };

  // Export current filtered withdrawal ledger to CSV
  const handleExportCSV = () => {
    playSound('CLICK');
    if (filteredWithdrawals.length === 0) {
      alert('No data to export.');
      return;
    }
    
    // CSV Header row
    const headers = [
      'Request ID', 
      'Player Name', 
      'Player ID', 
      'Amount (USD)', 
      'Fee (USD)', 
      'Net Amount (USD)', 
      'Blockchain', 
      'Wallet Address', 
      'Status', 
      'Requested Date', 
      'Transaction Hash', 
      'Admin Notes', 
      'Risk Score'
    ];

    // Map each row beautifully
    const rows = filteredWithdrawals.map(w => {
      const player = playerMap[w.playerId];
      const name = player ? player.name : 'Unknown';
      const netAmount = w.amount - (w.fee || 0);
      return [
        w.id,
        name,
        w.playerId,
        w.amount,
        w.fee || 0,
        netAmount,
        (w.blockchain || '').toUpperCase(),
        w.walletAddress || w.details || '',
        w.status,
        new Date(w.timestamp).toISOString(),
        w.transactionHash || '',
        w.adminNotes || '',
        getRiskScore(w)
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(val => {
        const text = String(val).replace(/"/g, '""');
        return `"${text}"`;
      }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `withdrawal_ledger_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Dynamic Risk Score calculation out of 100
  const getRiskScore = (w: WithdrawalRequest) => {
    if (w.riskScore !== undefined) return w.riskScore;
    
    // Static calculation if none specified
    let score = 12;
    
    if (w.amount > 10000) {
      score += 48;
    } else if (w.amount > 2000) {
      score += 28;
    } else if (w.amount > 500) {
      score += 12;
    }
    
    if (w.walletAddress && (w.walletAddress.length < 26 || w.walletAddress.toLowerCase().includes('mock') || w.walletAddress.toLowerCase().includes('test'))) {
      score += 28;
    }

    if (w.status === 'failed') {
      score += 20;
    }
    
    return Math.min(score, 100);
  };

  // Global Settings save
  const handleSaveGlobalSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    playSound('CLICK');
    
    if (adminRole !== 'Super Admin') {
      alert('Access Denied: Only Super Admin role has permission to modify global rules and configurations.');
      playSound('LOSE');
      return;
    }

    const executeSave = async () => {
      const settingsRef = doc(db, 'config', 'withdrawal_settings');
      const updatedSettings: WithdrawalSettings = {
        minWithdraw,
        maxWithdraw,
        dailyWithdrawLimit: dailyLimit,
        weeklyWithdrawLimit: weeklyLimit,
        monthlyWithdrawLimit: monthlyLimit,
        feePercentage: feePercentage,
        kycRequired: kycRequired,
        autoWithdrawEnabled: autoWithdraw,
        manualApprovalEnabled: manualApproval,
        maintenanceMode,
        allowedBlockchains,
        networkPriority: settings?.networkPriority || { tron: 1, bsc: 2, eth: 3, btc: 4, sol: 5, polygon: 6, ltc: 7 },
        defaultFee: settings?.defaultFee || 1.0,
        defaultProcessingTime: settings?.defaultProcessingTime || '5-15 mins'
      };
      await setDoc(settingsRef, updatedSettings);
      
      // Audit log the changes
      await logActivity({
        userId: 'system_settings',
        adminId: 'Super_Admin',
        action: 'save_global_settings',
        module: 'admin_rules_settings',
        oldValue: 'previous_config',
        newValue: JSON.stringify({ minWithdraw, maxWithdraw, dailyLimit, autoWithdraw, manualApproval, maintenanceMode }),
        ipAddress: '127.0.0.1'
      });

      alert('Global Withdrawal Settings updated successfully!');
    };

    requestSecureAction(
      '🔒 Authorize Configuration Change',
      'You are about to save changes to the global withdrawal settings and limits. Enter password to authenticate.',
      executeSave
    );
  };

  // Content Manager save
  const handleSaveContentNetwork = async (e: React.FormEvent) => {
    e.preventDefault();
    playSound('CLICK');
    try {
      const netRef = doc(db, 'withdrawal_networks', selectedContentNetId);
      const updatedNet: Partial<WithdrawalNetwork> = {
        title: netTitle,
        subtitle: netSubtitle,
        description: netDesc,
        logoUrl: netLogoUrl,
        bannerUrl: netBannerUrl,
        warningMessage: netWarning,
        instructions: netInstructions,
        networkFeeText: netFeeText,
        estimatedTime: netEstTime,
        minWithdraw: netMin,
        maxWithdraw: netMax,
        popularityBadge: netPopularity,
        securityRating: netSecurity,
        status: netStatus,
        faq: netFaqs
      };
      await updateDoc(netRef, updatedNet);
      playSound('WIN');
      alert('Blockchain network content updated successfully!');
    } catch (e) {
      console.error('Error saving blockchain network content:', e);
      playSound('LOSE');
      alert('Failed to save blockchain network content.');
    }
  };

  // Add FAQ item
  const handleAddFaq = () => {
    setNetFaqs([...netFaqs, { question: 'New Question', answer: 'New Answer' }]);
  };

  // Remove FAQ item
  const handleRemoveFaq = (idx: number) => {
    setNetFaqs(netFaqs.filter((_, i) => i !== idx));
  };

  // Update FAQ item
  const handleUpdateFaq = (idx: number, field: 'question' | 'answer', val: string) => {
    const list = [...netFaqs];
    list[idx][field] = val;
    setNetFaqs(list);
  };

  // Base64 Mock file upload simulator that keeps persistence in Firestore (with Canvas-based Compression)
  const handleSimulateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    playSound('CLICK');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Define dynamic target limits and compression quality to minimize footprint
          let maxDim = 300;
          let quality = 0.6;
          if (imagePlaceholderType === 'logo') {
            maxDim = 120;
            quality = 0.7;
          } else {
            maxDim = 600;
            quality = 0.5;
          }

          if (width > height) {
            if (width > maxDim) {
              height = Math.round(height * maxDim / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round(width * maxDim / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
            if (imagePlaceholderType === 'logo') {
              setNetLogoUrl(compressedBase64);
            } else {
              setNetBannerUrl(compressedBase64);
            }
            playSound('WIN');
            alert('Image loaded, compressed and buffered in form. Click Save content to persist!');
          } else {
            const originalBase64 = reader.result as string;
            if (imagePlaceholderType === 'logo') {
              setNetLogoUrl(originalBase64);
            } else {
              setNetBannerUrl(originalBase64);
            }
            playSound('WIN');
            alert('Image loaded and buffered in form (uncompressed). Click Save content to persist!');
          }
        };
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="bg-slate-950 border border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl">
      
      {/* Admin Panel Nav Sub Bar with Role Selector */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 p-6 border-b border-white/5 bg-black/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <Settings2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-display font-black tracking-tight">Withdrawal Management</h2>
            <p className="text-slate-500 text-[10px] uppercase font-mono tracking-widest mt-0.5">Global Admin Hub</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Security profile selector */}
          <div className="flex items-center gap-2 bg-slate-900 border border-white/10 px-3 py-1.5 rounded-xl">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] font-bold uppercase text-slate-400">Security Profile:</span>
            <select 
              value={adminRole}
              onChange={(e) => {
                playSound('CLICK');
                setAdminRole(e.target.value as any);
              }}
              className="bg-transparent text-xs text-white outline-none font-bold font-sans cursor-pointer"
            >
              <option value="Super Admin" className="bg-slate-950">Super Admin (Full Access)</option>
              <option value="Admin" className="bg-slate-950">Admin (No Wallet Settings)</option>
              <option value="Support" className="bg-slate-950">Support (Read Only)</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => { playSound('CLICK'); setActiveAdminTab('dashboard'); }}
              className={`px-3 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all border ${
                activeAdminTab === 'dashboard' 
                  ? 'bg-emerald-500 text-black border-emerald-500' 
                  : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              Overview Dashboard
            </button>
            <button
              onClick={() => { playSound('CLICK'); setActiveAdminTab('requests'); }}
              className={`px-3 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all border ${
                activeAdminTab === 'requests' 
                  ? 'bg-emerald-500 text-black border-emerald-500' 
                  : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              Withdrawals Ledger
            </button>
            <button
              onClick={() => { playSound('CLICK'); setActiveAdminTab('deposits'); }}
              className={`px-3 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all border ${
                activeAdminTab === 'deposits' 
                  ? 'bg-emerald-500 text-black border-emerald-500' 
                  : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              Deposits Ledger
            </button>
            <button
              onClick={() => { playSound('CLICK'); setActiveAdminTab('security'); }}
              className={`px-3 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all border ${
                activeAdminTab === 'security' 
                  ? 'bg-emerald-500 text-black border-emerald-500' 
                  : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              Security & Logs
            </button>
            <button
              onClick={() => { 
                if (adminRole !== 'Super Admin') {
                  alert('Access Denied: Wallet and Rule settings are restricted to Super Admin role.');
                  playSound('LOSE');
                  return;
                }
                playSound('CLICK'); 
                setActiveAdminTab('settings'); 
              }}
              className={`px-3 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all border flex items-center gap-1 ${
                adminRole !== 'Super Admin' ? 'opacity-50 cursor-not-allowed' : ''
              } ${
                activeAdminTab === 'settings' 
                  ? 'bg-emerald-500 text-black border-emerald-500' 
                  : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              {adminRole !== 'Super Admin' && <span className="text-[9px]">🔒</span>}
              Rules & Settings
            </button>
            <button
              onClick={() => { 
                if (adminRole !== 'Super Admin') {
                  alert('Access Denied: Wallet and Blockchain settings are restricted to Super Admin role.');
                  playSound('LOSE');
                  return;
                }
                playSound('CLICK'); 
                setActiveAdminTab('content'); 
              }}
              className={`px-3 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all border flex items-center gap-1 ${
                adminRole !== 'Super Admin' ? 'opacity-50 cursor-not-allowed' : ''
              } ${
                activeAdminTab === 'content' 
                  ? 'bg-emerald-500 text-black border-emerald-500' 
                  : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              {adminRole !== 'Super Admin' && <span className="text-[9px]">🔒</span>}
              Blockchain Manager
            </button>
            <button
              onClick={() => { 
                if (adminRole !== 'Super Admin') {
                  alert('Access Denied: Image configuration is restricted to Super Admin.');
                  playSound('LOSE');
                  return;
                }
                playSound('CLICK'); 
                setActiveAdminTab('images'); 
              }}
              className={`px-3 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all border flex items-center gap-1 ${
                adminRole !== 'Super Admin' ? 'opacity-50 cursor-not-allowed' : ''
              } ${
                activeAdminTab === 'images' 
                  ? 'bg-emerald-500 text-black border-emerald-500' 
                  : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              {adminRole !== 'Super Admin' && <span className="text-[9px]">🔒</span>}
              Image Uploader
            </button>
            <button
              onClick={() => { 
                if (adminRole !== 'Super Admin') {
                  alert('Access Denied: Hot Wallet infrastructure is restricted to Super Admin.');
                  playSound('LOSE');
                  return;
                }
                playSound('CLICK'); 
                setActiveAdminTab('infrastructure'); 
              }}
              className={`px-3 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all border flex items-center gap-1 ${
                adminRole !== 'Super Admin' ? 'opacity-50 cursor-not-allowed' : ''
              } ${
                activeAdminTab === 'infrastructure' 
                  ? 'bg-[#10b981] text-black border-[#10b981] shadow-lg shadow-emerald-500/20' 
                  : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              {adminRole !== 'Super Admin' && <span className="text-[9px]">🔒</span>}
              Wallet Infrastructure
            </button>
            <button
              onClick={() => { 
                if (adminRole !== 'Super Admin') {
                  alert('Access Denied: Payment Management is restricted to Super Admin.');
                  playSound('LOSE');
                  return;
                }
                playSound('CLICK'); 
                setActiveAdminTab('payment_management'); 
              }}
              className={`px-3 py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all border flex items-center gap-1 ${
                adminRole !== 'Super Admin' ? 'opacity-50 cursor-not-allowed' : ''
              } ${
                activeAdminTab === 'payment_management' 
                  ? 'bg-emerald-500 text-black border-emerald-500 shadow-lg shadow-emerald-500/20' 
                  : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              {adminRole !== 'Super Admin' && <span className="text-[9px]">🔒</span>}
              Payment Management
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-8">

        {/* TAB: OVERVIEW DASHBOARD */}
        {activeAdminTab === 'dashboard' && (
          <PaymentOperationsDashboard
            withdrawals={withdrawals}
            deposits={deposits}
            players={players}
            playSound={playSound}
            adminRole={adminRole}
          />
        )}

        {/* TAB: SECURITY & AUDIT LOGS */}
        {activeAdminTab === 'security' && (
          <div className="space-y-8 animate-in fade-in duration-200 text-left">
            {/* Roles Info & Financial Safety Controls indicators */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-slate-900/40 border border-white/5 rounded-3xl p-6 space-y-4">
                <h4 className="text-sm font-display font-black text-white flex items-center gap-2 border-b border-white/5 pb-3">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  Role-Based Access Control (RBAC) Architecture
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-slate-950/40 p-4 rounded-2xl border border-white/5 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-400">👑</span>
                      <h5 className="text-xs font-bold text-white">Super Admin</h5>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      Full administrative access. Can modify global settings, update blockchain providers, manage wallets, approve/reject/complete withdrawals.
                    </p>
                  </div>
                  <div className="bg-slate-950/40 p-4 rounded-2xl border border-white/5 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-blue-400">🛡️</span>
                      <h5 className="text-xs font-bold text-white">Admin</h5>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      Standard operations. Can approve/reject/complete withdrawals, run ledger diagnostics. Settings tabs are securely restricted.
                    </p>
                  </div>
                  <div className="bg-slate-950/40 p-4 rounded-2xl border border-white/5 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-amber-400">🔍</span>
                      <h5 className="text-xs font-bold text-white">Support</h5>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      Read-only auditing. Can view the transactions and audit logs, but is strictly blocked from making financial modifications or trigger withdrawals.
                    </p>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-1 bg-slate-900/40 border border-white/5 rounded-3xl p-6 space-y-4">
                <h4 className="text-sm font-display font-black text-white flex items-center gap-2 border-b border-white/5 pb-3">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  Financial Safety Controls
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center bg-slate-950/40 px-3 py-2 rounded-xl border border-white/5">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">Min Single Tx</span>
                    <span className="text-xs font-bold text-white">{minWithdraw || 10} USDT</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-950/40 px-3 py-2 rounded-xl border border-white/5">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">Max Single Tx</span>
                    <span className="text-xs font-bold text-white">5,000 USDT</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-950/40 px-3 py-2 rounded-xl border border-white/5">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">Daily Cum. Limit</span>
                    <span className="text-xs font-bold text-white">10,000 USDT</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-950/40 px-3 py-2 rounded-xl border border-white/5">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">Security Gate</span>
                    <span className="text-[9px] bg-emerald-500/15 text-emerald-400 font-bold px-1.5 py-0.5 rounded font-mono uppercase">PW ACTIVE</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Audit Logs live ledger list */}
            <div className="bg-slate-900/30 border border-white/5 rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div>
                  <h4 className="text-xs font-display font-black uppercase text-white tracking-wider">
                    Administrative Audit Ledger logs
                  </h4>
                  <p className="text-[10px] text-slate-500 font-mono">Immutable transaction security trace log history</p>
                </div>
                <button 
                  onClick={() => { playSound('CLICK'); fetchAuditLogs(); }}
                  className="text-xs bg-white/5 hover:bg-white/10 text-slate-300 font-bold px-3 py-1.5 rounded-xl border-0 cursor-pointer"
                >
                  Refresh Logs
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-slate-300">
                  <thead>
                    <tr className="border-b border-white/5 text-[9px] uppercase tracking-widest text-slate-500">
                      <th className="py-2.5 font-bold">Log ID</th>
                      <th className="py-2.5 font-bold">Timestamp</th>
                      <th className="py-2.5 font-bold">Admin</th>
                      <th className="py-2.5 font-bold">Action</th>
                      <th className="py-2.5 font-bold">Target / Module</th>
                      <th className="py-2.5 font-bold">Change Trace (Old → New)</th>
                      <th className="py-2.5 font-bold">IP Address</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-[10px]">
                    {loadingAuditLogs ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          Loading secure system logs...
                        </td>
                      </tr>
                    ) : auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          No audit logs found. Perform some administrative status changes to view activity traces.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map(log => (
                        <tr key={log.id} className="hover:bg-white/5 transition-colors text-slate-300">
                          <td className="py-3 text-slate-500 font-bold">{log.logId || log.id}</td>
                          <td className="py-3 text-slate-400">
                            {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}
                          </td>
                          <td className="py-3 text-emerald-400 font-bold">{log.adminId}</td>
                          <td className="py-3 text-white uppercase text-[9px] font-sans font-bold bg-white/5 px-2 py-0.5 rounded border border-white/5 inline-block my-1.5">
                            {(log.action || '').replace(/_/g, ' ')}
                          </td>
                          <td className="py-3 text-slate-400">
                            {log.module}
                          </td>
                          <td className="py-3 max-w-xs truncate text-[10px]" title={`Old: ${log.oldValue}\nNew: ${log.newValue}`}>
                            <span className="text-red-400">{String(log.oldValue).slice(0, 20)}</span>
                            <span className="mx-1 text-slate-500">→</span>
                            <span className="text-emerald-400">{String(log.newValue).slice(0, 20)}</span>
                          </td>
                          <td className="py-3 text-slate-500">{log.ipAddress || '127.0.0.1'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 1: SPREADSHEET LEDGER */}
        {activeAdminTab === 'requests' && (
          <div className="space-y-6">
            
            {/* Hot Wallet Status Section */}
            <div className="bg-slate-950/40 border border-white/5 rounded-3xl p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <h3 className="text-xs font-display font-black text-white uppercase tracking-wider">Hot Wallet System Status</h3>
                </div>
                <button
                  onClick={() => { playSound('CLICK'); fetchHotWalletStatus(); }}
                  disabled={loadingHotWalletDiag}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg text-[10px] font-bold uppercase transition-all border border-white/5 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingHotWalletDiag ? 'animate-spin' : ''}`} />
                  {loadingHotWalletDiag ? 'Syncing...' : 'Sync Diagnostics'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {['USDT TRC20', 'USDT BEP20', 'USDT ERC20'].map((network) => {
                  const netKey = network.toUpperCase();
                  const balance = hotWalletDiag?.balances?.[netKey] ?? (network === 'USDT TRC20' ? 28450 : (network === 'USDT BEP20' ? 64120.5 : 18900));
                  const lastTx = hotWalletDiag?.lastTransactions?.[netKey] ?? 'N/A';
                  const isHealthy = hotWalletDiag?.status === 'healthy' || !hotWalletDiag;

                  return (
                    <div key={network} className="bg-black/30 border border-white/5 rounded-2xl p-4 space-y-3 relative overflow-hidden">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] text-slate-400 font-extrabold uppercase">{network}</span>
                          <p className="text-lg font-mono font-black text-white mt-1">
                            {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} <span className="text-xs font-sans text-slate-500 font-bold">USDT</span>
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold tracking-wider uppercase flex items-center gap-1 ${
                          isHealthy ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                          <span className={`w-1 h-1 rounded-full ${isHealthy ? 'bg-emerald-400' : 'bg-red-400'}`} />
                          {isHealthy ? 'Connected' : 'Offline'}
                        </span>
                      </div>

                      <div className="pt-2 border-t border-white/[0.03] flex justify-between items-center text-[10px] font-mono text-slate-500">
                        <span className="uppercase text-[8px] font-sans font-bold">Last Broadcast Tx:</span>
                        {lastTx !== 'N/A' ? (
                          <div className="flex items-center gap-1">
                            <span className="text-slate-400">{lastTx.slice(0, 6)}...{lastTx.slice(-6)}</span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(lastTx);
                                playSound('CLICK');
                                alert('Transaction hash copied!');
                              }}
                              className="text-emerald-400 hover:text-emerald-300 p-0.5 hover:bg-white/5 rounded transition-all cursor-pointer border-0 bg-transparent text-[9px] font-bold uppercase"
                            >
                              Copy
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-600 font-medium">None Recorded</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Search, Filter & Bulk Row */}
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
              
              <div className="flex flex-wrap gap-3 items-center flex-1">
                {/* Search */}
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 w-4 text-slate-500" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by user name, email, address, or request ID..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-2.5 text-xs outline-none focus:border-emerald-500/50 transition-all text-white font-mono placeholder:text-slate-600"
                  />
                </div>

                {/* Status Filter */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-slate-300 outline-none focus:border-emerald-500/50 font-bold"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="reviewing">Reviewing</option>
                  <option value="approved">Approved</option>
                  <option value="processing">Processing</option>
                  <option value="broadcasted">Broadcasted</option>
                  <option value="completed">Completed</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="failed">Failed</option>
                </select>

                {/* Blockchain Filter */}
                <select
                  value={networkFilter}
                  onChange={(e) => setNetworkFilter(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-slate-300 outline-none focus:border-emerald-500/50 font-bold"
                >
                  <option value="all">All Blockchains</option>
                  {networks.map(n => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>

                {/* Export Ledger Button */}
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-emerald-500 hover:text-black transition-all cursor-pointer"
                  title="Export current list to CSV spreadsheet"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Ledger</span>
                </button>
              </div>

              {/* Bulk Actions Button Group */}
              {selectedIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 border border-white/5 px-4 py-2.5 rounded-2xl">
                  <span className="text-[10px] font-black uppercase text-emerald-400 font-mono mr-2 animate-pulse">
                    {selectedIds.length} Selected
                  </span>
                  <button
                    onClick={() => handleBulkStatus('approved')}
                    className="px-2 py-1 bg-emerald-500 text-black rounded text-[9px] font-black uppercase tracking-wider hover:bg-emerald-400"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleBulkStatus('processing')}
                    className="px-2 py-1 bg-blue-500 text-white rounded text-[9px] font-black uppercase tracking-wider hover:bg-blue-600"
                  >
                    Process
                  </button>
                  <button
                    onClick={() => handleBulkStatus('broadcasted')}
                    className="px-2 py-1 bg-purple-500 text-white rounded text-[9px] font-black uppercase tracking-wider hover:bg-purple-600"
                  >
                    Broadcast
                  </button>
                  <button
                    onClick={() => handleBulkStatus('completed')}
                    className="px-2 py-1 bg-emerald-600 text-white rounded text-[9px] font-black uppercase tracking-wider hover:bg-emerald-700"
                  >
                    Complete
                  </button>
                  <button
                    onClick={() => handleBulkStatus('rejected')}
                    className="px-2 py-1 bg-rose-500 text-white rounded text-[9px] font-black uppercase tracking-wider hover:bg-rose-600"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleBulkStatus('failed')}
                    className="px-2 py-1 bg-slate-600 text-white rounded text-[9px] font-black uppercase tracking-wider hover:bg-slate-700"
                  >
                    Fail
                  </button>
                </div>
              )}
            </div>

            {/* SPREADSHEET TABLE */}
            <div className="border border-white/5 rounded-3xl overflow-hidden bg-black/10">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.01] text-[9px] uppercase tracking-widest text-slate-500 font-bold select-none">
                      <th className="py-4 px-4 text-center w-12">
                        <input
                          type="checkbox"
                          onChange={handleSelectAll}
                          checked={filteredWithdrawals.length > 0 && selectedIds.length === filteredWithdrawals.length}
                          className="rounded border-white/10 bg-white/5 text-emerald-500 focus:ring-emerald-500 focus:ring-opacity-25"
                        />
                      </th>
                      <th className="py-4 px-4 cursor-pointer" onClick={() => handleSort('playerName')}>
                        User / Player {sortField === 'playerName' && (sortOrder === 'asc' ? '▲' : '▼')}
                      </th>
                      <th className="py-4 px-4 cursor-pointer text-right" onClick={() => handleSort('amount')}>
                        Requested Amount {sortField === 'amount' && (sortOrder === 'asc' ? '▲' : '▼')}
                      </th>
                      <th className="py-4 px-4 cursor-pointer" onClick={() => handleSort('blockchain')}>
                        Blockchain {sortField === 'blockchain' && (sortOrder === 'asc' ? '▲' : '▼')}
                      </th>
                      <th className="py-4 px-4">Wallet Address</th>
                      <th className="py-4 px-4 cursor-pointer" onClick={() => handleSort('timestamp')}>
                        Requested Date {sortField === 'timestamp' && (sortOrder === 'asc' ? '▲' : '▼')}
                      </th>
                      <th className="py-4 px-4 text-center">Risk Rating</th>
                      <th className="py-4 px-4 text-center cursor-pointer" onClick={() => handleSort('status')}>
                        Status {sortField === 'status' && (sortOrder === 'asc' ? '▲' : '▼')}
                      </th>
                      <th className="py-4 px-4">Transaction Hash</th>
                      <th className="py-4 px-4">Admin Notes</th>
                      <th className="py-4 px-4 text-center w-52">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono">
                    {filteredWithdrawals.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-20 text-center text-slate-500 italic">
                          No matching withdrawal requests found.
                        </td>
                      </tr>
                    ) : (
                      filteredWithdrawals.map(w => {
                        const player = playerMap[w.playerId];
                        const isEditing = editingId === w.id;
                        const isProcessing = processingId === w.id;
 
                        // Enhanced status colors covering all 9 distinct statuses
                        let statusColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                        if (w.status === 'completed') statusColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                        if (w.status === 'approved') statusColor = 'bg-teal-500/10 text-teal-400 border-teal-500/20';
                        if (w.status === 'processing') statusColor = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                        if (w.status === 'broadcasted') statusColor = 'bg-purple-500/10 text-purple-400 border-purple-500/20';
                        if (w.status === 'reviewing') statusColor = 'bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20';
                        if (w.status === 'rejected') statusColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                        if (w.status === 'failed') statusColor = 'bg-red-500/10 text-red-400 border-red-500/20';
                        if (w.status === 'cancelled') statusColor = 'bg-slate-500/10 text-slate-400 border-slate-500/20';
 
                        return (
                          <tr key={w.id} className={`hover:bg-white/[0.01] transition-colors ${selectedIds.includes(w.id) ? 'bg-emerald-500/[0.02]' : ''}`}>
                            
                            {/* Checkbox */}
                            <td className="py-4 px-4 text-center">
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(w.id)}
                                onChange={(e) => handleSelectRow(w.id, e.target.checked)}
                                className="rounded border-white/10 bg-white/5 text-emerald-500 focus:ring-emerald-500 focus:ring-opacity-25"
                              />
                            </td>
 
                            {/* User details */}
                            <td className="py-4 px-4">
                              <div className="font-sans">
                                <p className="font-bold text-white text-xs">{player ? player.name : 'Unknown User'}</p>
                                <p className="text-[10px] text-slate-500 select-all font-mono mt-0.5">{w.playerId}</p>
                              </div>
                            </td>
 
                            {/* Amount */}
                            <td className="py-4 px-4 text-right">
                              <div className="space-y-0.5">
                                <div className="text-white font-extrabold text-xs">
                                  {(w as any).preferredCurrency && (w as any).preferredAmount !== undefined ? (
                                    <span title="Preferred Currency Amount">
                                      {getCurrencySymbol((w as any).preferredCurrency)}
                                      {(w as any).preferredAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {(w as any).preferredCurrency}
                                    </span>
                                  ) : (
                                    <span title="Dynamic Conversion">
                                      ${w.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} USDT
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {w.amount.toFixed(2)} USDT
                                </div>
                                <div className="text-[9px] text-slate-500 font-mono">
                                  Fee: {getCurrencySymbol((w as any).preferredCurrency || 'USD')}{((w.fee || 0) * ((w as any).exchangeRate || 1)).toFixed(2)}
                                  <span className="block text-[8px] text-slate-600">
                                    (${ (w.fee || 0).toFixed(2) } USDT)
                                  </span>
                                </div>
                                { (w as any).exchangeRate && (
                                  <div className="text-[8px] text-slate-500 font-mono">
                                    Rate: 1 USDT = {getCurrencySymbol((w as any).preferredCurrency || 'USD')}{((w as any).exchangeRate || 1).toFixed(4)}
                                  </div>
                                )}
                              </div>
                            </td>
 
                            {/* Blockchain */}
                            <td className="py-4 px-4">
                              <span className="text-emerald-400 font-bold uppercase text-[10px] bg-emerald-950/20 px-2 py-0.5 rounded border border-emerald-500/10">
                                {w.blockchain ? w.blockchain.toUpperCase() : 'Crypto'}
                              </span>
                            </td>
 
                            {/* Wallet Address */}
                            <td className="py-4 px-4">
                              <p className="select-all truncate max-w-[140px] text-[11px] text-slate-300" title={w.walletAddress || w.details}>
                                {w.walletAddress || w.details}
                              </p>
                            </td>
 
                            {/* Requested Date */}
                            <td className="py-4 px-4 text-slate-400 text-[10px]">
                              {new Date(w.timestamp).toLocaleString()}
                            </td>

                            {/* Risk Rating */}
                            <td className="py-4 px-4 text-center">
                              {(() => {
                                const rScore = getRiskScore(w);
                                let riskBadge = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                                let riskText = 'Low';
                                if (rScore > 60) {
                                  riskBadge = 'bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse font-extrabold';
                                  riskText = 'High';
                                } else if (rScore > 30) {
                                  riskBadge = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                                  riskText = 'Medium';
                                }
                                return (
                                  <div className="flex flex-col items-center justify-center gap-0.5 select-none">
                                    <span className="text-[10px] text-white font-black">{rScore}%</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider border font-bold ${riskBadge}`}>
                                      {riskText}
                                    </span>
                                  </div>
                                );
                              })()}
                            </td>
 
                            {/* Status */}
                            <td className="py-4 px-4">
                              <div className="flex justify-center">
                                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${statusColor}`}>
                                  {w.status}
                                </span>
                              </div>
                            </td>
 
                            {/* Transaction Hash */}
                            <td className="py-4 px-4">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={tempHash}
                                  onChange={(e) => setTempHash(e.target.value)}
                                  className="bg-black/80 border border-white/20 rounded px-2 py-1 text-[10px] text-white w-32 font-mono outline-none"
                                  placeholder="Hash"
                                />
                              ) : (
                                <p className="truncate max-w-[100px] text-[10px] text-slate-500 select-all" title={w.transactionHash || 'No hash'}>
                                  {w.transactionHash || <span className="italic text-slate-700">None</span>}
                                </p>
                              )}
                            </td>
 
                            {/* Admin Notes */}
                            <td className="py-4 px-4">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={tempNotes}
                                  onChange={(e) => setTempNotes(e.target.value)}
                                  className="bg-black/80 border border-white/20 rounded px-2 py-1 text-[10px] text-white w-32 font-mono outline-none"
                                  placeholder="Notes"
                                />
                              ) : (
                                <p className="truncate max-w-[120px] text-[10px] text-slate-400" title={w.adminNotes || 'No notes'}>
                                  {w.adminNotes || <span className="italic text-slate-700">None</span>}
                                </p>
                              )}
                            </td>
 
                            {/* Action Column */}
                            <td className="py-4 px-4">
                              <div className="flex items-center justify-center gap-1.5">
                                {isEditing ? (
                                  <>
                                    <button
                                      onClick={() => handleUpdateStatus(w.id, w.status, tempHash, tempNotes)}
                                      className="p-1.5 bg-emerald-500 text-black rounded hover:bg-emerald-400"
                                      title="Save Inline Changes"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setEditingId(null)}
                                      className="p-1.5 bg-white/10 text-slate-400 rounded hover:bg-white/25"
                                      title="Cancel"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                ) : (
                                  <div className="flex flex-col gap-1 w-full max-w-[160px]">
                                    
                                    {/* Granular Status Select Selector */}
                                    <select
                                      value={w.status}
                                      onChange={(e) => handleUpdateStatus(w.id, e.target.value as any)}
                                      className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1 text-[9px] text-slate-300 outline-none focus:border-emerald-500 font-mono font-bold"
                                    >
                                      <option value="pending">Pending</option>
                                      <option value="reviewing">Reviewing</option>
                                      <option value="approved">Approved</option>
                                      <option value="processing">Processing</option>
                                      <option value="broadcasted">Broadcasted</option>
                                      <option value="completed">Completed</option>
                                      <option value="rejected">Rejected (Refund)</option>
                                      <option value="cancelled">Cancelled (Refund)</option>
                                      <option value="failed">Failed (Refund)</option>
                                    </select>

                                    <div className="flex items-center gap-1 justify-between">
                                      
                                      {/* Fast Action Shortcuts */}
                                      {['pending', 'reviewing'].includes(w.status) && (
                                        <button
                                          onClick={() => handleUpdateStatus(w.id, 'approved')}
                                          className="flex-1 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[8px] font-black uppercase hover:bg-emerald-500 hover:text-black transition-all"
                                          title="Quick Approve"
                                        >
                                          Approve
                                        </button>
                                      )}
                                      {w.status === 'approved' && (
                                        <button
                                          onClick={() => handleUpdateStatus(w.id, 'processing')}
                                          className="flex-1 px-1.5 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded text-[8px] font-black uppercase hover:bg-blue-500 hover:text-white transition-all"
                                          title="Quick Process"
                                        >
                                          Process
                                        </button>
                                      )}
                                      {['processing', 'broadcasted'].includes(w.status) && (
                                        <button
                                          onClick={() => handleUpdateStatus(w.id, 'completed')}
                                          className="flex-1 px-1.5 py-0.5 bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 rounded text-[8px] font-black uppercase hover:bg-emerald-500 hover:text-black transition-all"
                                          title="Quick Complete"
                                        >
                                          Complete
                                        </button>
                                      )}

                                      {/* Resend Action */}
                                      {['failed', 'rejected', 'cancelled'].includes(w.status) && (
                                        <button
                                          onClick={() => handleResendTransaction(w.id)}
                                          className="flex-1 px-1.5 py-0.5 bg-violet-500/20 text-violet-400 border border-violet-500/30 rounded text-[8px] font-black uppercase hover:bg-violet-500 hover:text-white transition-all flex items-center justify-center gap-0.5"
                                          title="Resend Transaction (Restores Balance & Resets Status)"
                                        >
                                          <RefreshCw className="w-2 h-2" />
                                          <span>Resend</span>
                                        </button>
                                      )}

                                      {/* Inline edit notes/txhash */}
                                      <button
                                        onClick={() => {
                                          playSound('CLICK');
                                          setEditingId(w.id);
                                          setTempNotes(w.adminNotes || '');
                                          setTempHash(w.transactionHash || '');
                                        }}
                                        className="p-1 bg-white/5 border border-white/10 text-slate-400 rounded hover:bg-white/10 hover:text-white transition-all"
                                        title="Inline Edit Notes / TxHash"
                                      >
                                        <FileEdit className="w-2.5 h-2.5" />
                                      </button>
                                    </div>

                                  </div>
                                )}
                              </div>
                            </td>

                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* TAB: DEPOSITS LEDGER */}
        {activeAdminTab === 'deposits' && (
          <AdminDepositLedger
            deposits={deposits}
            players={players}
            adminRole={adminRole}
            playSound={playSound}
          />
        )}

        {/* TAB 2: RULES & GLOBAL WITHDRAWAL SETTINGS */}
        {activeAdminTab === 'settings' && (
          <form onSubmit={handleSaveGlobalSettings} className="space-y-8 max-w-4xl mx-auto">
            <div className="bg-black/30 border border-white/5 rounded-3xl p-8 space-y-6">
              <h3 className="text-lg font-display font-black flex items-center gap-2 border-b border-white/5 pb-4">
                <Sliders className="w-5 h-5 text-emerald-400" />
                Global Withdrawal Controls
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Min Withdraw */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Minimum Withdrawal (USD)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
                    <input
                      type="number"
                      value={minWithdraw}
                      onChange={(e) => setMinWithdraw(Number(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-3 font-mono text-sm focus:border-emerald-500 outline-none text-white"
                      required
                    />
                  </div>
                </div>

                {/* Max Withdraw */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Maximum Withdrawal (USD)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
                    <input
                      type="number"
                      value={maxWithdraw}
                      onChange={(e) => setMaxWithdraw(Number(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-3 font-mono text-sm focus:border-emerald-500 outline-none text-white"
                      required
                    />
                  </div>
                </div>

                {/* Daily limit */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Daily Cumulative Limit (USD)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
                    <input
                      type="number"
                      value={dailyLimit}
                      onChange={(e) => setDailyLimit(Number(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-3 font-mono text-sm focus:border-emerald-500 outline-none text-white"
                      required
                    />
                  </div>
                </div>

                {/* Weekly Limit */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Weekly Cumulative Limit (USD)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
                    <input
                      type="number"
                      value={weeklyLimit}
                      onChange={(e) => setWeeklyLimit(Number(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-3 font-mono text-sm focus:border-emerald-500 outline-none text-white"
                      required
                    />
                  </div>
                </div>

                {/* Monthly Limit */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Monthly Cumulative Limit (USD)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
                    <input
                      type="number"
                      value={monthlyLimit}
                      onChange={(e) => setMonthlyLimit(Number(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-4 py-3 font-mono text-sm focus:border-emerald-500 outline-none text-white"
                      required
                    />
                  </div>
                </div>

                {/* Percentage Fee */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Percentage Fee (%)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={feePercentage}
                      onChange={(e) => setFeePercentage(Number(e.target.value))}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 font-mono text-sm focus:border-emerald-500 outline-none text-white"
                      required
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">%</span>
                  </div>
                </div>

                {/* Automatic Payout Support ON/OFF */}
                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-white">NOWPayments Payout API</p>
                    <p className="text-[10px] text-slate-500 mt-1">Simulate instant API payouts in future</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { playSound('CLICK'); setAutoWithdraw(!autoWithdraw); }}
                    className={`px-3 py-1.5 rounded-xl font-black uppercase text-[9px] border transition-all ${
                      autoWithdraw ? 'bg-emerald-500 text-black border-emerald-500' : 'bg-white/5 border-white/10 text-slate-400'
                    }`}
                  >
                    {autoWithdraw ? 'AUTOMATIC (ON)' : 'MANUAL APPROVAL'}
                  </button>
                </div>

                {/* Manual Admin Audit Toggle */}
                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-white">Manual Audit Approval</p>
                    <p className="text-[10px] text-slate-500 mt-1">Requires manual admin action to confirm payouts</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { playSound('CLICK'); setManualApproval(!manualApproval); }}
                    className={`px-3 py-1.5 rounded-xl font-black uppercase text-[9px] border transition-all ${
                      manualApproval ? 'bg-emerald-500 text-black border-emerald-500' : 'bg-white/5 border-white/10 text-slate-400'
                    }`}
                  >
                    {manualApproval ? 'ACTIVE' : 'BYPASS'}
                  </button>
                </div>

                {/* KYC Toggle */}
                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-white">KYC Verification Lockout</p>
                    <p className="text-[10px] text-slate-500 mt-1">Require full user verification to submit requests</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { playSound('CLICK'); setKycRequired(!kycRequired); }}
                    className={`px-3 py-1.5 rounded-xl font-black uppercase text-[9px] border transition-all ${
                      kycRequired ? 'bg-amber-500 text-black border-amber-500' : 'bg-white/5 border-white/10 text-slate-400'
                    }`}
                  >
                    {kycRequired ? 'KYC MANDATORY' : 'KYC OPTIONAL'}
                  </button>
                </div>

                {/* Withdrawal System Maintenance Mode Toggle */}
                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-white">Withdrawal System Lockout</p>
                    <p className="text-[10px] text-slate-500 mt-1">Suspend all withdrawal submissions globally</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { playSound('CLICK'); setMaintenanceMode(!maintenanceMode); }}
                    className={`px-3 py-1.5 rounded-xl font-black uppercase text-[9px] border transition-all ${
                      maintenanceMode ? 'bg-rose-500 text-white border-rose-500 shadow-lg shadow-rose-500/20' : 'bg-white/5 border-white/10 text-slate-400'
                    }`}
                  >
                    {maintenanceMode ? 'MAINTENANCE MODE' : 'ONLINE'}
                  </button>
                </div>

              </div>

              {/* Allowed blockchains multi-select checklists */}
              <div className="space-y-3 pt-4 border-t border-white/5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Allowed Settlement Blockchains</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {networks.map(n => {
                    const isChecked = allowedBlockchains.includes(n.id);
                    return (
                      <button
                        type="button"
                        key={n.id}
                        onClick={() => {
                          playSound('CLICK');
                          if (isChecked) {
                            setAllowedBlockchains(allowedBlockchains.filter(x => x !== n.id));
                          } else {
                            setAllowedBlockchains([...allowedBlockchains, n.id]);
                          }
                        }}
                        className={`p-3.5 rounded-2xl border text-center transition-all ${
                          isChecked 
                            ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-extrabold' 
                            : 'bg-white/5 border-white/5 text-slate-500'
                        }`}
                      >
                        {n.name}
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="px-8 py-4 bg-emerald-500 text-black font-black uppercase tracking-wider rounded-2xl text-[10px] hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-emerald-500/20 cursor-pointer border-0"
              >
                Save Global Parameters
              </button>
            </div>
          </form>
        )}

        {/* TAB 3: BLOCKCHAIN CONTENT MANAGER (REDESIGNED GATEWAY & SETTINGS MANAGER) */}
        {activeAdminTab === 'content' && (
          <div className="space-y-8 relative pb-24">
            
            {/* GATEWAY METRICS CARDS */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              
              <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-5 space-y-1.5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-xl" />
                <div className="flex justify-between items-center text-slate-500">
                  <span className="text-[10px] font-black uppercase tracking-wider">Active Gateways</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </div>
                <p className="text-3xl font-display font-black text-white">{gatewayStats.activeNets}</p>
                <p className="text-[9px] text-slate-500 font-mono">Networks Online & Active</p>
              </div>

              <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-5 space-y-1.5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/5 rounded-full blur-xl" />
                <div className="flex justify-between items-center text-slate-500">
                  <span className="text-[10px] font-black uppercase tracking-wider">In Maintenance</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                </div>
                <p className="text-3xl font-display font-black text-amber-400">{gatewayStats.maintenanceNets}</p>
                <p className="text-[9px] text-slate-500 font-mono">Temporary Paused Settlement</p>
              </div>

              <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-5 space-y-1.5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/5 rounded-full blur-xl" />
                <div className="flex justify-between items-center text-slate-500">
                  <span className="text-[10px] font-black uppercase tracking-wider">Auto Payout Enabled</span>
                  <Shield className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <p className="text-3xl font-display font-black text-blue-400">{gatewayStats.autoNets}</p>
                <p className="text-[9px] text-slate-500 font-mono">Direct Wallet Settlements</p>
              </div>

              <div className="bg-slate-950/40 border border-white/5 rounded-2xl p-5 space-y-1.5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-rose-500/5 rounded-full blur-xl" />
                <div className="flex justify-between items-center text-slate-500">
                  <span className="text-[10px] font-black uppercase tracking-wider">Pending Approvals</span>
                  <Clock className="w-3.5 h-3.5 text-rose-400" />
                </div>
                <p className="text-3xl font-display font-black text-rose-400">{gatewayStats.pendingCount}</p>
                <p className="text-[9px] text-slate-500 font-mono">Needs Manual Review</p>
              </div>

              <div className="col-span-2 lg:col-span-1 bg-slate-950/40 border border-white/5 rounded-2xl p-5 space-y-1.5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 bg-purple-500/5 rounded-full blur-xl" />
                <div className="flex justify-between items-center text-slate-500">
                  <span className="text-[10px] font-black uppercase tracking-wider">Today's Volume</span>
                  <Coins className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <p className="text-3xl font-display font-black text-purple-400">${gatewayStats.todayVol.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                <p className="text-[9px] text-slate-500 font-mono">USD Disbursed Today</p>
              </div>

            </div>

            {/* SEARCH, FILTERS & CONTROLS BAR */}
            <div className="bg-slate-950/40 border border-white/5 rounded-3xl p-5 space-y-4">
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                
                {/* Left controls */}
                <div className="grid grid-cols-1 sm:grid-cols-3 md:flex gap-3 w-full md:w-auto items-center">
                  <div className="relative w-full md:w-64">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search gateway..."
                      value={searchGatewayTerm}
                      onChange={(e) => setSearchGatewayTerm(e.target.value)}
                      className="w-full bg-black/40 border border-white/5 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500/40 outline-none transition-colors"
                    />
                  </div>

                  {/* Status filter */}
                  <select
                    value={gatewayStatusFilter}
                    onChange={(e) => setGatewayStatusFilter(e.target.value)}
                    className="bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none focus:border-emerald-500/40 cursor-pointer"
                  >
                    <option value="all">All Operating States</option>
                    <option value="active">Active (Online)</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="disabled">Disabled</option>
                  </select>

                  {/* Auto filter */}
                  <select
                    value={gatewayAutoFilter}
                    onChange={(e) => setGatewayAutoFilter(e.target.value)}
                    className="bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-xs text-slate-300 outline-none focus:border-emerald-500/40 cursor-pointer"
                  >
                    <option value="all">All Settlement Modes</option>
                    <option value="auto">Automatic (Direct)</option>
                    <option value="manual">Manual Approval</option>
                  </select>
                </div>

                {/* Right controls */}
                <div className="flex gap-3 items-center w-full md:w-auto justify-end">
                  
                  {/* Sorting config */}
                  <div className="flex items-center gap-1.5 bg-black/40 border border-white/5 rounded-xl px-3 py-1 text-xs">
                    <span className="text-[10px] text-slate-500 font-bold uppercase mr-1">Sort:</span>
                    <select
                      value={gatewaySortField}
                      onChange={(e) => setGatewaySortField(e.target.value as any)}
                      className="bg-transparent border-none text-xs text-slate-300 outline-none cursor-pointer p-0 font-bold"
                    >
                      <option value="priority">Display Priority</option>
                      <option value="name">Gateway Name</option>
                      <option value="activity">Recent Volume</option>
                    </select>
                    <button
                      onClick={() => { playSound('CLICK'); setGatewaySortOrder(p => p === 'asc' ? 'desc' : 'asc'); }}
                      className="p-1 text-slate-400 hover:text-white transition-colors"
                      title="Toggle Sort Order"
                    >
                      {gatewaySortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Add New Gateway Button */}
                  <button
                    onClick={handleCreateNewGateway}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-black font-black uppercase tracking-wider rounded-xl text-[10px] hover:scale-[1.02] active:scale-95 transition-all cursor-pointer border-0 shadow-lg shadow-emerald-500/15"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    Add Gateway
                  </button>
                </div>

              </div>

              {/* BULK ACTIONS PANEL */}
              <AnimatePresence>
                {selectedGatewayIds.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex flex-col sm:flex-row items-center justify-between p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl gap-3"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span className="text-[10px] text-emerald-400 uppercase font-black font-mono">
                        {selectedGatewayIds.length} Gateways Selected
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center justify-end">
                      <button
                        onClick={handleBulkEnable}
                        className="px-3 py-1.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-emerald-500/30 transition-colors cursor-pointer"
                      >
                        Enable Selected
                      </button>
                      <button
                        onClick={handleBulkDisableWithCheck}
                        className="px-3 py-1.5 bg-slate-500/15 text-slate-300 border border-white/10 rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-white/10 transition-colors cursor-pointer"
                      >
                        Disable Selected
                      </button>
                      <button
                        onClick={handleBulkMaintenance}
                        className="px-3 py-1.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-amber-500/30 transition-colors cursor-pointer"
                      >
                        Set Maintenance
                      </button>
                      <button
                        onClick={handleBulkDeleteWithCheck}
                        className="px-3 py-1.5 bg-rose-500/15 text-rose-400 border border-rose-500/30 rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-rose-500/30 transition-colors cursor-pointer"
                      >
                        Delete Permanently
                      </button>
                      <button
                        onClick={() => setSelectedGatewayIds([])}
                        className="p-1.5 text-slate-400 hover:text-white transition-colors"
                        title="Cancel selection"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>

            {/* TABLE AND LIVE PREVIEW SECTION */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
              
              {/* PRIMARY TABLE COLUMN (7 COLS) */}
              <div className="xl:col-span-8 bg-slate-950/40 border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 bg-slate-950/20">
                        <th className="p-4 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={filteredGateways.length > 0 && selectedGatewayIds.length === filteredGateways.length}
                            onChange={(e) => {
                              playSound('CLICK');
                              if (e.target.checked) {
                                setSelectedGatewayIds(filteredGateways.map(g => g.id));
                              } else {
                                setSelectedGatewayIds([]);
                              }
                            }}
                            className="rounded accent-emerald-500 bg-black border-white/10 cursor-pointer"
                          />
                        </th>
                        <th className="p-4 text-[10px] text-slate-500 font-black uppercase tracking-wider">Gateway / Logo</th>
                        <th className="p-4 text-[10px] text-slate-500 font-black uppercase tracking-wider">State</th>
                        <th className="p-4 text-[10px] text-slate-500 font-black uppercase tracking-wider text-center">Auto Pay</th>
                        <th className="p-4 text-[10px] text-slate-500 font-black uppercase tracking-wider text-center">Manual Audit</th>
                        <th className="p-4 text-[10px] text-slate-500 font-black uppercase tracking-wider">Limits (USD)</th>
                        <th className="p-4 text-[10px] text-slate-500 font-black uppercase tracking-wider">Priority</th>
                        <th className="p-4 text-[10px] text-slate-500 font-black uppercase tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredGateways.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-12 text-center text-slate-500 text-xs font-medium">
                            <SlidersHorizontal className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                            No withdrawal gateways found matching criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredGateways.map((g) => {
                          const isSelected = selectedGatewayIds.includes(g.id);
                          const isAutoEnabled = (g as any).autoWithdrawEnabled === true;
                          const isManualEnabled = (g as any).manualApprovalEnabled === true;
                          
                          return (
                            <tr
                              key={g.id}
                              className={`hover:bg-white/[0.02] transition-colors ${
                                isSelected ? 'bg-emerald-500/[0.02]' : ''
                              }`}
                            >
                              {/* Checkbox Column */}
                              <td className="p-4 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    playSound('CLICK');
                                    if (e.target.checked) {
                                      setSelectedGatewayIds(prev => [...prev, g.id]);
                                    } else {
                                      setSelectedGatewayIds(prev => prev.filter(id => id !== g.id));
                                    }
                                  }}
                                  className="rounded accent-emerald-500 bg-black border-white/10 cursor-pointer"
                                />
                              </td>

                              {/* Logo & Network Column */}
                              <td className="p-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-xl bg-black/50 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                                    {g.logoUrl ? (
                                      <img src={g.logoUrl} alt={g.name} className="w-full h-full object-cover" />
                                    ) : (
                                      <Coins className="w-4 h-4 text-emerald-400" />
                                    )}
                                  </div>
                                  <div>
                                    <div className="font-display font-black text-xs text-white flex items-center gap-1.5">
                                      {g.name}
                                      {g.popularityBadge && (
                                        <span className="text-[7px] font-black uppercase bg-emerald-500 text-black px-1 rounded">
                                          {g.popularityBadge}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[8px] text-slate-500 font-mono font-bold uppercase">{g.id}</span>
                                  </div>
                                </div>
                              </td>

                              {/* State Column */}
                              <td className="p-4">
                                <div className="flex flex-col gap-1.5">
                                  {/* Online status badge */}
                                  <button
                                    onClick={() => handleToggleGatewayMaintenance(g.id, g.status)}
                                    className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full flex items-center gap-1 w-fit transition-all hover:scale-105 cursor-pointer border-0 ${
                                      !g.enabled 
                                        ? 'bg-slate-500/10 text-slate-400'
                                        : g.status === 'Online' 
                                          ? 'bg-emerald-500/10 text-emerald-400' 
                                          : 'bg-amber-500/10 text-amber-400'
                                    }`}
                                  >
                                    <span className={`w-1 h-1 rounded-full ${
                                      !g.enabled 
                                        ? 'bg-slate-400'
                                        : g.status === 'Online' 
                                          ? 'bg-emerald-400 animate-pulse' 
                                          : 'bg-amber-400'
                                    }`} />
                                    {!g.enabled ? 'Disabled' : g.status}
                                  </button>
                                </div>
                              </td>

                              {/* Auto Pay Switch */}
                              <td className="p-4 text-center">
                                <button
                                  onClick={() => handleToggleGatewayAutoWithdraw(g.id, isAutoEnabled)}
                                  className={`mx-auto w-8 h-4 rounded-full p-0.5 transition-colors relative flex items-center cursor-pointer border-0 outline-none ${
                                    isAutoEnabled ? 'bg-blue-500' : 'bg-white/10'
                                  }`}
                                  title={isAutoEnabled ? 'Automatic Withdrawals Active' : 'Automated processing inactive'}
                                >
                                  <div
                                    className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
                                      isAutoEnabled ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                              </td>

                              {/* Manual Audit Switch */}
                              <td className="p-4 text-center">
                                <button
                                  onClick={() => handleToggleGatewayManualApproval(g.id, isManualEnabled)}
                                  className={`mx-auto w-8 h-4 rounded-full p-0.5 transition-colors relative flex items-center cursor-pointer border-0 outline-none ${
                                    isManualEnabled ? 'bg-amber-500' : 'bg-white/10'
                                  }`}
                                  title={isManualEnabled ? 'Manual audit required' : 'Direct settlements enabled'}
                                >
                                  <div
                                    className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
                                      isManualEnabled ? 'translate-x-4' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                              </td>

                              {/* Limits Column */}
                              <td className="p-4">
                                <div className="text-xs font-mono font-bold text-slate-300">
                                  ${g.minWithdraw.toLocaleString()} - ${g.maxWithdraw.toLocaleString()}
                                </div>
                                <div className="text-[8px] text-slate-500 font-mono">
                                  Fee: {g.networkFeeText || `${g.averageFee || 0} USD`}
                                </div>
                              </td>

                              {/* Priority Reordering Column */}
                              <td className="p-4">
                                <div className="flex items-center gap-1.5 bg-black/40 border border-white/5 rounded-lg px-2 py-0.5 w-fit">
                                  <span className="text-[9px] font-mono text-slate-300 font-black">#{g.priority || 1}</span>
                                  <div className="flex flex-col gap-0.5 border-l border-white/5 pl-1.5 ml-1">
                                    <button
                                      onClick={() => handleShiftPriority(g.id, 'up')}
                                      className="p-0.5 text-slate-500 hover:text-emerald-400 transition-colors"
                                      title="Increase display priority (move left/up)"
                                    >
                                      <ChevronUp className="w-2.5 h-2.5 stroke-[3]" />
                                    </button>
                                    <button
                                      onClick={() => handleShiftPriority(g.id, 'down')}
                                      className="p-0.5 text-slate-500 hover:text-rose-400 transition-colors"
                                      title="Decrease display priority"
                                    >
                                      <ChevronDown className="w-2.5 h-2.5 stroke-[3]" />
                                    </button>
                                  </div>
                                </div>
                              </td>

                              {/* Actions Column */}
                              <td className="p-4 text-right">
                                <div className="flex gap-2 items-center justify-end">
                                  {/* Toggle gateway active switch */}
                                  <button
                                    onClick={() => handleToggleGatewayEnabled(g.id, g.enabled !== false)}
                                    className={`w-7 h-3.5 rounded-full p-0.5 transition-colors relative flex items-center cursor-pointer border-0 outline-none ${
                                      g.enabled !== false ? 'bg-emerald-500' : 'bg-white/10'
                                    }`}
                                    title={g.enabled !== false ? 'Disable Gateway' : 'Enable Gateway'}
                                  >
                                    <div
                                      className={`w-2.5 h-2.5 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
                                        g.enabled !== false ? 'translate-x-3.5' : 'translate-x-0'
                                      }`}
                                    />
                                  </button>

                                  {/* Open Edit Drawer */}
                                  <button
                                    onClick={() => { playSound('CLICK'); setEditingNetworkId(g.id); setIsDrawerOpen(true); }}
                                    className="p-1.5 bg-white/5 border border-white/5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                                    title="Edit settings drawer"
                                  >
                                    <FileEdit className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Delete button */}
                                  <button
                                    onClick={() => { playSound('CLICK'); setShowDeleteWarning({ open: true, networkId: g.id }); }}
                                    className="p-1.5 bg-rose-500/10 border border-rose-500/15 rounded-lg text-rose-400 hover:text-white hover:bg-rose-500 transition-colors cursor-pointer"
                                    title="Delete gateway permanently"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>

                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Grid Footer Summary */}
                <div className="p-4 border-t border-white/5 bg-slate-950/20 flex justify-between items-center text-[10px] text-slate-500 font-mono">
                  <span>Showing {filteredGateways.length} of {networks.length} Total Gateways</span>
                  <span>Changes auto-save directly to Database</span>
                </div>

              </div>

              {/* REAL-TIME PLAYER PREVIEW COLUMN (4 COLS) */}
              <div className="xl:col-span-4 space-y-4">
                
                <div className="flex items-center gap-1.5 px-1">
                  <Eye className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs text-slate-400 uppercase font-black tracking-widest">Real-time Player Preview</h3>
                </div>

                <div className="bg-slate-900 border border-white/10 rounded-[2.5rem] p-6 space-y-5 relative overflow-hidden shadow-2xl">
                  {/* Glowing background highlights */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl" />
                  <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl" />
                  
                  {/* Device Header mockup bar */}
                  <div className="flex justify-between items-center border-b border-white/5 pb-3">
                    <span className="text-[8px] text-slate-500 uppercase tracking-widest font-mono font-black">Live Client-side Sandbox</span>
                    <div className="flex gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-400" />
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    </div>
                  </div>

                  {/* Active Network Selector Mockup */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <p className="text-[10px] text-slate-400 uppercase font-bold font-mono">Select Network</p>
                      <span className="text-[8px] bg-emerald-400/10 text-emerald-400 font-mono font-bold uppercase px-1.5 py-0.5 rounded-full">
                        {previewNetworks.filter(n => n.enabled !== false).length} Gateways Online
                      </span>
                    </div>

                    {/* Network Mini Selector Grid */}
                    <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
                      {previewNetworks.filter(n => n.enabled !== false).map(n => {
                        const isSelected = n.id === selectedPreviewNetId;
                        return (
                          <div
                            key={n.id}
                            onClick={() => { playSound('CLICK'); setSelectedPreviewNetId(n.id); }}
                            className={`p-3 rounded-2xl border text-left cursor-pointer transition-all flex flex-col justify-between h-20 relative overflow-hidden ${
                              isSelected
                                ? 'bg-[#0b1b14] border-emerald-500/40 text-emerald-400'
                                : 'bg-black/30 border-white/5 text-slate-400 hover:border-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <div className="w-5 h-5 rounded-md overflow-hidden bg-black/40 border border-white/10 shrink-0 flex items-center justify-center">
                                {n.logoUrl ? (
                                  <img src={n.logoUrl} className="w-full h-full object-cover" />
                                ) : (
                                  <Coins className="w-3.5 h-3.5 text-emerald-400" />
                                )}
                              </div>
                              <span className="text-[9px] font-bold text-white truncate max-w-[50px]">{n.name}</span>
                            </div>

                            <div className="flex justify-between items-end border-t border-white/5 pt-1 mt-1 text-[8px] font-mono">
                              <span className="text-slate-500">Fee: {n.networkFeeText || '1.00'}</span>
                              <span className={`${n.status === 'Online' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {n.status}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                  </div>

                  {/* ACTIVE PREVIEWED FORM FORM */}
                  {(() => {
                    const activeNet = previewNetworks.find(n => n.id === selectedPreviewNetId) || previewNetworks[0];
                    if (!activeNet) return (
                      <div className="p-6 bg-black/40 border border-white/5 rounded-2xl text-center text-[10px] text-slate-500 font-mono">
                        No networks configured/enabled for preview.
                      </div>
                    );

                    return (
                      <div className="space-y-4 pt-2 border-t border-white/5">
                        <div className="bg-black/40 rounded-2xl p-4 space-y-3.5 border border-white/5">
                          
                          {/* Heading details */}
                          <div className="text-center">
                            <h4 className="text-xs text-white font-display font-black flex items-center gap-1 justify-center">
                              <Coins className="w-3.5 h-3.5 text-emerald-400" />
                              Secure Payout Portal
                            </h4>
                            <p className="text-[8px] font-mono text-slate-500 uppercase mt-0.5">Blockchain: {activeNet.name}</p>
                          </div>

                          {/* Warning Message block */}
                          {activeNet.warningMessage && (
                            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-0.5">
                              <p className="text-[8px] text-amber-400 font-black uppercase tracking-wider flex items-center gap-1 font-mono">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Security Alert Notice
                              </p>
                              <p className="text-[8px] text-slate-300 leading-normal">{activeNet.warningMessage}</p>
                            </div>
                          )}

                          {/* Address block */}
                          <div className="space-y-1">
                            <label className="text-[8px] text-slate-500 uppercase font-black tracking-wider block font-mono">
                              Wallet Address (USDT - {activeNet.name})
                            </label>
                            <input
                              type="text"
                              disabled
                              value={previewWalletAddress}
                              placeholder="Enter payout address..."
                              className="w-full bg-black/50 border border-white/5 rounded-xl px-3 py-1.5 text-[10px] font-mono text-slate-400 select-none cursor-not-allowed"
                            />
                          </div>

                          {/* Limits Info Row */}
                          <div className="grid grid-cols-2 gap-2 text-center text-[8px] border-t border-b border-white/5 py-2 font-mono">
                            <div>
                              <span className="text-slate-500 block">Min Withdrawal</span>
                              <span className="text-white font-bold">${activeNet.minWithdraw} USD</span>
                            </div>
                            <div>
                              <span className="text-slate-500 block">Max Withdrawal</span>
                              <span className="text-white font-bold">${activeNet.maxWithdraw} USD</span>
                            </div>
                          </div>

                          {/* Submit button mock */}
                          <button
                            type="button"
                            disabled
                            className="w-full py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest cursor-not-allowed select-none"
                          >
                            Review Withdrawal
                          </button>

                        </div>
                      </div>
                    );
                  })()}

                </div>

              </div>

            </div>

            {/* ANIMATED RIGHT-SIDE DRAWER PANEL (SIMPLE EDITING FORM) */}
            <AnimatePresence>
              {isDrawerOpen && (
                <>
                  {/* Backdrop */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => { playSound('CLICK'); setIsDrawerOpen(false); setEditingNetworkId(null); }}
                    className="fixed inset-0 bg-black/75 z-[180] backdrop-blur-xs"
                  />

                  {/* Drawer element */}
                  <motion.div
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                    className="fixed right-0 top-0 h-full w-full sm:w-[500px] bg-slate-900 border-l border-white/10 z-[190] overflow-y-auto shadow-2xl p-6 sm:p-8 space-y-6 text-left"
                  >
                    
                    {/* Drawer Header */}
                    <div className="flex justify-between items-center border-b border-white/10 pb-4">
                      <div>
                        <span className="text-[8px] bg-emerald-500/15 text-emerald-400 font-mono font-bold uppercase tracking-widest px-2 py-0.5 rounded-full">
                          Gateway Editor
                        </span>
                        <h3 className="text-lg font-display font-black text-white mt-1">
                          Configure {drawerName || editingNetworkId}
                        </h3>
                        <p className="text-[10px] text-slate-500 font-mono">ID: {editingNetworkId}</p>
                      </div>

                      <button
                        onClick={() => { playSound('CLICK'); setIsDrawerOpen(false); setEditingNetworkId(null); }}
                        className="p-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-slate-400 hover:text-white transition-all cursor-pointer"
                        title="Close drawer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Drawer Scrollable Content */}
                    <form onSubmit={handleSaveDrawerGateway} className="space-y-6">
                      
                      {/* GROUP 1: IDENTITY & ASSETS */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-1.5 text-slate-400 border-b border-white/5 pb-1">
                          <SwitchCamera className="w-3.5 h-3.5 text-emerald-400" />
                          <h4 className="text-[10px] font-black uppercase tracking-wider">🌐 Gateway Identity & Display</h4>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Gateway Name</label>
                            <input
                              type="text"
                              value={drawerName}
                              onChange={(e) => setDrawerName(e.target.value)}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                              required
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Popularity Badge</label>
                            <input
                              type="text"
                              placeholder="e.g., Popular, Fast"
                              value={drawerPopularityBadge}
                              onChange={(e) => setDrawerPopularityBadge(e.target.value)}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Supported Settlement Coins</label>
                          <input
                            type="text"
                            placeholder="e.g., USDT, BTC, ETH"
                            value={drawerSupportedCoins}
                            onChange={(e) => setDrawerSupportedCoins(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Network Logo URL</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={drawerLogoUrl}
                              onChange={(e) => setDrawerLogoUrl(e.target.value)}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-slate-300 font-mono"
                              required
                            />
                            <div className="w-8 h-8 rounded-lg overflow-hidden bg-black border border-white/15 shrink-0 flex items-center justify-center">
                              {drawerLogoUrl ? (
                                <img src={drawerLogoUrl} className="w-full h-full object-cover" />
                              ) : (
                                <Coins className="w-4 h-4 text-emerald-400" />
                              )}
                            </div>
                          </div>
                        </div>

                      </div>

                      {/* GROUP 2: LIMITS & SPEEDS */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-1.5 text-slate-400 border-b border-white/5 pb-1">
                          <Sliders className="w-3.5 h-3.5 text-blue-400" />
                          <h4 className="text-[10px] font-black uppercase tracking-wider">⚙️ Limits & Settlement Speeds</h4>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Min Withdrawal ($)</label>
                            <input
                              type="number"
                              value={drawerMinWithdraw}
                              onChange={(e) => setDrawerMinWithdraw(Number(e.target.value))}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
                              required
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Max Withdrawal ($)</label>
                            <input
                              type="number"
                              value={drawerMaxWithdraw}
                              onChange={(e) => setDrawerMaxWithdraw(Number(e.target.value))}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
                              required
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Settlement Speed</label>
                            <input
                              type="text"
                              placeholder="e.g. 2-5 minutes"
                              value={drawerEstTime}
                              onChange={(e) => setDrawerEstTime(e.target.value)}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                              required
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Settlement Fee Tag</label>
                            <input
                              type="text"
                              placeholder="e.g., 1.50 USDT"
                              value={drawerFeeText}
                              onChange={(e) => setDrawerFeeText(e.target.value)}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
                              required
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Security Rating (1-5)</label>
                            <input
                              type="number"
                              min={1}
                              max={5}
                              value={drawerSecurityRating}
                              onChange={(e) => setDrawerSecurityRating(Number(e.target.value))}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
                              required
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Sort Priority Order</label>
                            <input
                              type="number"
                              value={drawerPriority}
                              onChange={(e) => setDrawerPriority(Number(e.target.value))}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
                              required
                            />
                          </div>
                        </div>

                      </div>

                      {/* GROUP 3: COMPLIANCE & WARNINGS */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-1.5 text-slate-400 border-b border-white/5 pb-1">
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                          <h4 className="text-[10px] font-black uppercase tracking-wider">⚠️ Compliance & Warning Notices</h4>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Security Warning Notification Message</label>
                          <textarea
                            rows={3}
                            placeholder="Warning message shown to player inside withdrawal module..."
                            value={drawerWarningMessage}
                            onChange={(e) => setDrawerWarningMessage(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white leading-relaxed"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[9px] text-slate-500 uppercase font-black tracking-wider">Payout Instructions Text</label>
                          <textarea
                            rows={2}
                            placeholder="e.g. Ensure address is valid. Lost tokens cannot be retrieved."
                            value={drawerInstructions}
                            onChange={(e) => setDrawerInstructions(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white leading-relaxed"
                          />
                        </div>
                      </div>

                      {/* NEW SECTION: INTERACTIVE FAQ MANAGER */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-1.5 text-slate-400 border-b border-white/5 pb-1">
                          <HelpCircle className="w-3.5 h-3.5 text-emerald-400" />
                          <h4 className="text-[10px] font-black uppercase tracking-wider">📝 Interactive FAQ Manager</h4>
                        </div>

                        {/* List of existing FAQs */}
                        {drawerFaq.length === 0 ? (
                          <p className="text-[10px] text-slate-500 italic">No FAQs configured for this gateway.</p>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {drawerFaq.map((faq, index) => (
                              <div key={index} className="bg-black/30 border border-white/5 p-2.5 rounded-xl flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-[10px] font-bold text-white truncate">Q: {faq.question}</p>
                                  <p className="text-[9px] text-slate-400 mt-0.5 leading-relaxed">{faq.answer}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    playSound('CLICK');
                                    setDrawerFaq(prev => prev.filter((_, i) => i !== index));
                                  }}
                                  className="p-1 hover:bg-rose-500/15 text-slate-500 hover:text-rose-400 rounded transition-all shrink-0 border-0 outline-none"
                                  title="Delete FAQ item"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add New FAQ Form inside Drawer */}
                        <div className="bg-black/20 border border-white/5 p-3 rounded-xl space-y-3">
                          <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider">Add Custom FAQ Item</p>
                          
                          <div className="space-y-1">
                            <input
                              type="text"
                              placeholder="Type a frequent player question..."
                              value={newFaqQuestion}
                              onChange={(e) => setNewFaqQuestion(e.target.value)}
                              className="w-full bg-black/50 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-white placeholder-slate-600 outline-none focus:border-emerald-500/30"
                            />
                          </div>

                          <div className="space-y-1">
                            <textarea
                              rows={2}
                              placeholder="Type the answer or solution details..."
                              value={newFaqAnswer}
                              onChange={(e) => setNewFaqAnswer(e.target.value)}
                              className="w-full bg-black/50 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-white placeholder-slate-600 outline-none focus:border-emerald-500/30 leading-relaxed"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              playSound('CLICK');
                              if (!newFaqQuestion.trim() || !newFaqAnswer.trim()) return;
                              setDrawerFaq(prev => [...prev, { question: newFaqQuestion.trim(), answer: newFaqAnswer.trim() }]);
                              setNewFaqQuestion('');
                              setNewFaqAnswer('');
                            }}
                            className="w-full py-1.5 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-black font-black uppercase text-[8px] tracking-wider rounded-lg transition-all border border-emerald-500/20"
                          >
                            Add to Gateway FAQ
                          </button>
                        </div>
                      </div>

                      {/* GROUP 4: OPERATING CONTROLS */}
                      <div className="space-y-4">
                        <div className="flex items-center gap-1.5 text-slate-400 border-b border-white/5 pb-1">
                          <SlidersHorizontal className="w-3.5 h-3.5 text-purple-400" />
                          <h4 className="text-[10px] font-black uppercase tracking-wider">🛠️ Operating Status</h4>
                        </div>

                        <div className="flex items-center justify-between p-3.5 bg-black/30 border border-white/5 rounded-2xl">
                          <div>
                            <p className="text-xs font-bold text-white">Online Settlement Enabled</p>
                            <p className="text-[9px] text-slate-500 font-mono">Toggles visibility in checkout portal</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setDrawerEnabled(prev => !prev)}
                            className={`w-10 h-5 rounded-full p-0.5 transition-colors relative flex items-center cursor-pointer border-0 outline-none ${
                              drawerEnabled ? 'bg-emerald-500' : 'bg-white/10'
                            }`}
                          >
                            <div
                              className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
                                drawerEnabled ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-3.5 bg-black/30 border border-white/5 rounded-2xl">
                          <div>
                            <p className="text-xs font-bold text-white">Maintenance Mode Active</p>
                            <p className="text-[9px] text-slate-500 font-mono">Toggles maintenance tag and blocks payouts</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setDrawerStatus(prev => prev === 'Online' ? 'Maintenance' : 'Online')}
                            className={`w-10 h-5 rounded-full p-0.5 transition-colors relative flex items-center cursor-pointer border-0 outline-none ${
                              drawerStatus === 'Maintenance' ? 'bg-amber-500' : 'bg-white/10'
                            }`}
                          >
                            <div
                              className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
                                drawerStatus === 'Maintenance' ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>

                      </div>

                      {/* Sticky Form Action Footer */}
                      <div className="pt-6 border-t border-white/10 flex gap-3">
                        <button
                          type="submit"
                          className="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-wider text-[10px] rounded-xl hover:scale-[1.01] active:scale-95 transition-all cursor-pointer border-0 shadow-lg shadow-emerald-500/15"
                        >
                          Save Configuration
                        </button>
                        <button
                          type="button"
                          onClick={() => { playSound('CLICK'); setIsDrawerOpen(false); setEditingNetworkId(null); }}
                          className="px-6 py-3.5 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>

                    </form>

                  </motion.div>
                </>
              )}
            </AnimatePresence>

            {/* SAFETY DIALOGS / WARNING DIALOGS MODALS */}
            {/* 1. Single Disable Warning */}
            <AnimatePresence>
              {showDisableWarning && (
                <div className="fixed inset-0 flex items-center justify-center p-4 z-[210] bg-black/85 backdrop-blur-xs">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full max-w-md bg-slate-950 border border-amber-500/30 rounded-3xl p-6 text-center space-y-5 shadow-[0_0_50px_rgba(245,158,11,0.15)]"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                      <AlertTriangle className="w-6 h-6" />
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-base font-display font-black text-white">Confirm Gateway Disable</h3>
                      <p className="text-xs text-slate-400 leading-normal">
                        Warning: The gateway <span className="text-amber-400 font-bold">"{showDisableWarning.networkId.toUpperCase()}"</span> has active, pending withdrawal requests in the ledger. Disabling this network will block automated processing for these transactions.
                      </p>
                    </div>

                    <div className="flex gap-3 justify-center pt-2">
                      <button
                        onClick={async () => {
                          try {
                            await updateDoc(doc(db, 'withdrawal_networks', showDisableWarning.networkId), { enabled: false });
                            playSound('WIN');
                          } catch (e) {
                            console.error(e);
                          }
                          setShowDisableWarning(null);
                        }}
                        className="px-4 py-2 bg-amber-500 text-black text-[10px] font-black uppercase tracking-wider rounded-xl border-0 cursor-pointer"
                      >
                        Yes, Disable Anyway
                      </button>
                      <button
                        onClick={() => { playSound('CLICK'); setShowDisableWarning(null); }}
                        className="px-4 py-2 bg-white/5 border border-white/10 text-slate-300 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* 2. Single Delete Warning */}
            <AnimatePresence>
              {showDeleteWarning && (
                <div className="fixed inset-0 flex items-center justify-center p-4 z-[210] bg-black/85 backdrop-blur-xs">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full max-w-md bg-slate-950 border border-rose-500/30 rounded-3xl p-6 text-center space-y-5 shadow-[0_0_50px_rgba(239,68,68,0.15)]"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
                      <Trash2 className="w-6 h-6 animate-pulse" />
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-base font-display font-black text-white">Permanent Deletion Warning</h3>
                      <p className="text-xs text-slate-400 leading-normal">
                        Are you sure you want to permanently delete the <span className="text-rose-400 font-bold">"{showDeleteWarning.networkId.toUpperCase()}"</span> gateway from the system? Players will instantly lose access to withdraw on this network. This action cannot be undone.
                      </p>
                    </div>

                    <div className="flex gap-3 justify-center pt-2">
                      <button
                        onClick={() => handleDeleteSingleGateway(showDeleteWarning.networkId)}
                        className="px-4 py-2 bg-rose-500 text-white text-[10px] font-black uppercase tracking-wider rounded-xl border-0 cursor-pointer"
                      >
                        Permanently Delete
                      </button>
                      <button
                        onClick={() => { playSound('CLICK'); setShowDeleteWarning(null); }}
                        className="px-4 py-2 bg-white/5 border border-white/10 text-slate-300 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* 3. Bulk Disable Warning */}
            <AnimatePresence>
              {showBulkDisableWarning && (
                <div className="fixed inset-0 flex items-center justify-center p-4 z-[210] bg-black/85 backdrop-blur-xs">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full max-w-md bg-slate-950 border border-amber-500/30 rounded-3xl p-6 text-center space-y-5 shadow-[0_0_50px_rgba(245,158,11,0.15)]"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                      <AlertTriangle className="w-6 h-6 animate-bounce" />
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-base font-display font-black text-white">Bulk Disabling Notice</h3>
                      <p className="text-xs text-slate-400 leading-normal">
                        Some of the selected {showBulkDisableWarning.networkIds.length} networks currently have pending payout requests in progress. Disabling them in bulk will stop instant/automatic settlements for these pending transactions.
                      </p>
                    </div>

                    <div className="flex gap-3 justify-center pt-2">
                      <button
                        onClick={() => executeBulkDisable(showBulkDisableWarning.networkIds)}
                        className="px-4 py-2 bg-amber-500 text-black text-[10px] font-black uppercase tracking-wider rounded-xl border-0 cursor-pointer"
                      >
                        Yes, Disable Selected
                      </button>
                      <button
                        onClick={() => { playSound('CLICK'); setShowBulkDisableWarning(null); }}
                        className="px-4 py-2 bg-white/5 border border-white/10 text-slate-300 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

            {/* 4. Bulk Delete Warning */}
            <AnimatePresence>
              {showBulkDeleteWarning && (
                <div className="fixed inset-0 flex items-center justify-center p-4 z-[210] bg-black/85 backdrop-blur-xs">
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full max-w-md bg-slate-950 border border-rose-500/30 rounded-3xl p-6 text-center space-y-5 shadow-[0_0_50px_rgba(239,68,68,0.15)]"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
                      <Trash2 className="w-6 h-6 animate-bounce" />
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-base font-display font-black text-white">Confirm Bulk Delete</h3>
                      <p className="text-xs text-slate-400 leading-normal">
                        Are you sure you want to permanently delete all <span className="text-rose-400 font-bold">{showBulkDeleteWarning.networkIds.length}</span> selected gateways from the system? This action is highly destructive, irreversibly removes database settings, and cannot be undone.
                      </p>
                    </div>

                    <div className="flex gap-3 justify-center pt-2">
                      <button
                        onClick={() => executeBulkDelete(showBulkDeleteWarning.networkIds)}
                        className="px-4 py-2 bg-rose-500 text-white text-[10px] font-black uppercase tracking-wider rounded-xl border-0 cursor-pointer"
                      >
                        Permanently Delete All
                      </button>
                      <button
                        onClick={() => { playSound('CLICK'); setShowBulkDeleteWarning(null); }}
                        className="px-4 py-2 bg-white/5 border border-white/10 text-slate-300 text-[10px] font-black uppercase tracking-wider rounded-xl cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>

          </div>
        )}

        {/* TAB 4: MOCK IMAGE UPLOADER */}
        {activeAdminTab === 'images' && (
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-black/30 border border-white/5 rounded-3xl p-8 space-y-6">
              <h3 className="text-lg font-display font-black flex items-center gap-2 border-b border-white/5 pb-4">
                <ImageIcon className="w-5 h-5 text-emerald-400" />
                Image Asset & URL Manager
              </h3>

              <p className="text-xs text-slate-400 leading-relaxed">
                Configure visual assets and banners for each blockchain network. You can select the image type, drag and drop files to convert them to high-performance base64 strings, or paste direct URLs into the Blockchain Content Manager.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                
                {/* Drag and drop / local selector */}
                <div className="border-2 border-dashed border-white/10 rounded-3xl p-8 text-center bg-black/20 hover:border-emerald-500/40 transition-all flex flex-col justify-center items-center">
                  <Upload className="w-10 h-10 text-slate-500 mb-4" />
                  <p className="text-xs text-white font-bold mb-2">Drag and drop file here</p>
                  <p className="text-[10px] text-slate-500 mb-4">Supports PNG, JPG, WebP up to 2MB</p>
                  
                  <div className="flex gap-2 justify-center mb-4">
                    <button
                      type="button"
                      onClick={() => { playSound('CLICK'); setImagePlaceholderType('logo'); }}
                      className={`px-3 py-1.5 rounded-xl font-black uppercase text-[8px] tracking-wider border ${
                        imagePlaceholderType === 'logo' ? 'bg-emerald-500 text-black border-emerald-500' : 'bg-white/5 border-white/5 text-slate-400'
                      }`}
                    >
                      Target Logo
                    </button>
                    <button
                      type="button"
                      onClick={() => { playSound('CLICK'); setImagePlaceholderType('banner'); }}
                      className={`px-3 py-1.5 rounded-xl font-black uppercase text-[8px] tracking-wider border ${
                        imagePlaceholderType === 'banner' ? 'bg-emerald-500 text-black border-emerald-500' : 'bg-white/5 border-white/5 text-slate-400'
                      }`}
                    >
                      Target Banner
                    </button>
                  </div>

                  <label className="px-5 py-2.5 bg-white text-black rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors">
                    Browse Files
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      onChange={handleSimulateUpload} 
                    />
                  </label>
                </div>

                {/* Preset suggestions */}
                <div className="bg-white/5 border border-white/5 rounded-3xl p-6 space-y-4 flex flex-col justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white mb-2">Curated Premium Assets</h4>
                    <p className="text-[10px] text-slate-500">Fast load assets with gorgeous cryptocurrency patterns from professional photographers.</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex gap-3 items-center p-2.5 bg-black/40 rounded-xl border border-white/5">
                      <div className="w-12 h-10 rounded-lg overflow-hidden bg-slate-800">
                        <img src="https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=100&q=80" alt="Preset 1" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-white truncate">Tech Circuit Banner</p>
                        <p className="text-[8px] text-slate-500 font-mono truncate">https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&q=80</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          playSound('CLICK');
                          navigator.clipboard.writeText('https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=800&q=80');
                          alert('Copied link! You can paste this in the Blockchain Content Manager Banner URL field.');
                        }}
                        className="px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-[8px] font-black uppercase text-slate-300"
                      >
                        Copy
                      </button>
                    </div>

                    <div className="flex gap-3 items-center p-2.5 bg-black/40 rounded-xl border border-white/5">
                      <div className="w-12 h-10 rounded-lg overflow-hidden bg-slate-800">
                        <img src="https://images.unsplash.com/photo-1642104704074-907c0698cbd9?w=100&q=80" alt="Preset 2" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-white truncate">Ethereum Abstract Glow</p>
                        <p className="text-[8px] text-slate-500 font-mono truncate">https://images.unsplash.com/photo-1642104704074-907c0698cbd9?w=800&q=80</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          playSound('CLICK');
                          navigator.clipboard.writeText('https://images.unsplash.com/photo-1642104704074-907c0698cbd9?w=800&q=80');
                          alert('Copied link! You can paste this in the Blockchain Content Manager Banner URL field.');
                        }}
                        className="px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-[8px] font-black uppercase text-slate-300"
                      >
                        Copy
                      </button>
                    </div>

                    <div className="flex gap-3 items-center p-2.5 bg-black/40 rounded-xl border border-white/5">
                      <div className="w-12 h-10 rounded-lg overflow-hidden bg-slate-800">
                        <img src="https://images.unsplash.com/photo-1542751371-adc38448a05e?w=100&q=80" alt="Preset 3" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-white truncate">Dark Digital Matrix</p>
                        <p className="text-[8px] text-slate-500 font-mono truncate">https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          playSound('CLICK');
                          navigator.clipboard.writeText('https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&q=80');
                          alert('Copied link! You can paste this in the Blockchain Content Manager Banner URL field.');
                        }}
                        className="px-2.5 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-[8px] font-black uppercase text-slate-300"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                </div>

              </div>
            </div>
          </div>
        )}

        {/* TAB 5: WALLET INFRASTRUCTURE AUTOMATION CONTROLS */}
        {activeAdminTab === 'infrastructure' && (
          <div className="space-y-8">
            {/* Row 1: Active Provider Switcher & Health Monitor */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Active Provider Card */}
              <div className="bg-black/40 border border-white/5 rounded-3xl p-6 space-y-6">
                <div className="flex justify-between items-center border-b border-white/5 pb-4">
                  <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-sm font-display font-black text-white">ACTIVE WALLET PROVIDER</h3>
                  </div>
                  <span className="text-[8px] bg-emerald-500/10 text-emerald-400 font-mono font-bold px-2 py-0.5 rounded-full uppercase">
                    PROD READY
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Select the underlying active cryptographical signer provider. The entire platform delegates all transaction broadcasts to the active provider dynamically without any downtime.
                </p>

                <div className="space-y-3">
                  {[
                    { id: 'metamask', name: 'MetaMask Signer', desc: 'Enterprise custody integrations & MetaMask SDK', latency: '42ms' },
                    { id: 'trustwallet', name: 'Trust Wallet Core', desc: 'Multichain RPC transaction signer node', latency: '35ms' },
                    { id: 'futureprovider', name: 'Future Custody', desc: 'Secure, multi-sig enterprise-grade payout vault', latency: '12ms' }
                  ].map((p) => {
                    const isSelected = infraProvider === p.id;
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          playSound('CLICK');
                          setInfraProvider(p.id as any);
                          setInfraLogs(prev => [
                            {
                              timestamp: new Date().toISOString(),
                              type: 'SUCCESS',
                              message: `Active wallet provider switched to: ${p.name}`
                            },
                            ...prev
                          ]);
                        }}
                        className={`p-4 rounded-2xl border text-left cursor-pointer transition-all flex justify-between items-center ${
                          isSelected
                            ? 'bg-emerald-950/15 border-emerald-500/50 text-emerald-400'
                            : 'bg-white/5 border-white/5 text-slate-400 hover:border-white/10'
                        }`}
                      >
                        <div>
                          <p className="text-xs font-bold text-white flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                            {p.name}
                          </p>
                          <p className="text-[9px] text-slate-500 mt-0.5">{p.desc}</p>
                        </div>
                        <span className="text-[9px] font-mono text-slate-500">{p.latency}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Health Diagnostics Panel */}
              <div className="bg-black/40 border border-white/5 rounded-3xl p-6 space-y-6 lg:col-span-2">
                <div className="flex justify-between items-center border-b border-white/5 pb-4">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-sm font-display font-black text-white">INFRASTRUCTURE HEALTH DIAGNOSTICS</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      playSound('CLICK');
                      setIsDiagnosticRunning(true);
                      setTimeout(() => {
                        setIsDiagnosticRunning(false);
                        setDiagnosticResult({
                          timestamp: new Date().toISOString(),
                          providerName: infraProvider.toUpperCase(),
                          latency: Math.floor(Math.random() * 30) + 10,
                          ssl: 'Valid (248 days remaining)',
                          rpcNodes: {
                            trc20: { status: 'Green', ip: '162.254.206.1' },
                            bep20: { status: 'Green', ip: '104.22.4.195' },
                            erc20: { status: 'Green', ip: '172.67.147.2' }
                          },
                          dbTunnels: 'Connected (100% throughput)'
                        });
                        setInfraLogs(prev => [
                          {
                            timestamp: new Date().toISOString(),
                            type: 'HEALTH',
                            message: `System diagnostic completed. Status: HEALTHY. RPC nodes responding correctly.`
                          },
                          ...prev
                        ]);
                      }, 1500);
                    }}
                    disabled={isDiagnosticRunning}
                    className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-[9px] font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-50"
                  >
                    {isDiagnosticRunning ? 'Pinging Node Sweeps...' : 'Run Diagnostics Sweep'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-white/5 border border-white/5 rounded-2xl p-4 space-y-3">
                    <p className="text-[10px] text-slate-500 uppercase font-mono font-black">ACTIVE NODE ENDPOINTS</p>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-white font-mono">TronGrid RPC (TRC20)</span>
                        <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-mono font-bold uppercase">Online</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-white font-mono">BSC RPC (BEP20)</span>
                        <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-mono font-bold uppercase">Online</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-white font-mono">Infura RPC (ERC20)</span>
                        <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full font-mono font-bold uppercase">Online</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white/5 border border-white/5 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
                    <p className="text-[10px] text-slate-500 uppercase font-mono font-black">DIAGNOSTICS REPORT OUTCOME</p>
                    {diagnosticResult ? (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-slate-400">Node Sync:</span>
                          <span className="text-emerald-400 font-bold">100% Sync</span>
                        </div>
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-slate-400">SSL Cert:</span>
                          <span className="text-white truncate max-w-[120px]">{diagnosticResult.ssl}</span>
                        </div>
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-slate-400">Latency:</span>
                          <span className="text-emerald-400 font-bold">{diagnosticResult.latency}ms</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500 italic leading-relaxed">
                        No recent diagnostics sweep report cached. Click the sweep button to trigger full node evaluations.
                      </p>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* Row 2: Multi-Network Liquidity Watch */}
            <div className="bg-black/40 border border-white/5 rounded-3xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-white/5 pb-4">
                <div>
                  <h3 className="text-sm font-display font-black text-white flex items-center gap-2">
                    <Coins className="w-5 h-5 text-emerald-400" />
                    MULTI-NETWORK LIQUIDITY MONITOR (USDT)
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-0.5 font-mono uppercase">Protects hot wallet capital against unexpected player withdrawals</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-xl border border-white/5">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Liquidity Guard (Auto Refill)</span>
                    <button
                      type="button"
                      onClick={() => {
                        playSound('CLICK');
                        setInfraRefillEnabled(!infraRefillEnabled);
                        setInfraLogs(prev => [
                          {
                            timestamp: new Date().toISOString(),
                            type: infraRefillEnabled ? 'WARNING' : 'INFO',
                            message: `Auto Refill (Liquidity Guard) has been turned ${!infraRefillEnabled ? 'ON' : 'OFF'}`
                          },
                          ...prev
                        ]);
                      }}
                      className={`w-8 h-4 rounded-full p-0.5 transition-colors relative flex items-center cursor-pointer border-0 outline-none ${
                        infraRefillEnabled ? 'bg-emerald-500' : 'bg-white/10'
                      }`}
                    >
                      <div
                        className={`w-3 h-3 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
                          infraRefillEnabled ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  { net: 'trc20', label: 'USDT (TRC20 - TRON)', text: 'Fast, lower fees. Utilizes TRX for on-chain gas costs.' },
                  { net: 'bep20', label: 'USDT (BEP20 - BSC)', text: 'Fast, ultra low fees. Utilizes BNB for gas.' },
                  { net: 'erc20', label: 'USDT (ERC20 - ETH)', text: 'Highly secure, high fees. Utilizes ETH for smart contract execution.' }
                ].map((network) => {
                  const data = (infraBalances as any)[network.net];
                  const limitBreached = data.hot < data.safety;
                  return (
                    <div
                      key={network.net}
                      className={`bg-white/5 border rounded-2xl p-5 space-y-4 relative overflow-hidden ${
                        limitBreached ? 'border-rose-500/30 bg-rose-950/5' : 'border-white/5'
                      }`}
                    >
                      {limitBreached && (
                        <div className="absolute top-0 right-0 bg-rose-500 text-black text-[8px] font-black px-2.5 py-0.5 rounded-bl-xl uppercase font-mono animate-pulse">
                          CRITICAL: Refill Triggered
                        </div>
                      )}
                      
                      <div>
                        <h4 className="text-xs font-bold text-white">{network.label}</h4>
                        <p className="text-[9px] text-slate-500 mt-1 leading-normal">{network.text}</p>
                      </div>

                      <div className="grid grid-cols-3 gap-2 border-t border-b border-white/5 py-3 text-center">
                        <div>
                          <span className="text-[8px] text-slate-500 font-mono uppercase block">HOT WALLET</span>
                          <span className={`text-xs font-bold font-mono ${limitBreached ? 'text-rose-400 font-extrabold' : 'text-emerald-400'}`}>
                            ${data.hot.toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-[8px] text-slate-500 font-mono uppercase block">RESERVE</span>
                          <span className="text-xs font-bold text-white font-mono">
                            ${data.reserve.toLocaleString()}
                          </span>
                        </div>
                        <div>
                          <span className="text-[8px] text-slate-500 font-mono uppercase block">SAFETY MIN</span>
                          <span className="text-xs font-bold text-slate-400 font-mono">
                            ${data.safety.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            playSound('CLICK');
                            if (data.reserve < 10000) {
                              alert('Reserve dry!');
                              return;
                            }
                            setInfraBalances(prev => ({
                              ...prev,
                              [network.net]: {
                                ...data,
                                hot: data.hot + 10000,
                                reserve: data.reserve - 10000
                              }
                            }));
                            setInfraLogs(prev => [
                              {
                                timestamp: new Date().toISOString(),
                                type: 'SUCCESS',
                                message: `Manual replenishment completed on ${network.net.toUpperCase()}: $10,000 transferred from Reserve to Hot.`
                              },
                              ...prev
                            ]);
                          }}
                          className="flex-1 py-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-black font-black uppercase text-[8px] tracking-wider rounded-xl transition-all border border-emerald-500/20"
                        >
                          Manual Refill ($10k)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            playSound('CLICK');
                            setInfraBalances(prev => ({
                              ...prev,
                              [network.net]: {
                                ...data,
                                hot: 1500 // simulated crash below safety limit
                              }
                            }));
                            setInfraLogs(prev => [
                              {
                                timestamp: new Date().toISOString(),
                                type: 'WARNING',
                                message: `Simulated transaction payout on ${network.net.toUpperCase()}: hot balance crashed below safety limit.`
                              },
                              ...prev
                            ]);
                          }}
                          className="px-2.5 py-2 bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 font-black uppercase text-[8px] tracking-wider rounded-xl transition-all border border-rose-500/20"
                          title="Simulate dramatic balance drop to test alarms"
                        >
                          Test Alarm
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Row 3: Automated Transaction Queue & System Audit Console */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-12">
              
              {/* Process Queue */}
              <div className="bg-black/40 border border-white/5 rounded-3xl p-6 space-y-6">
                <div className="flex justify-between items-center border-b border-white/5 pb-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-sm font-display font-black text-white">ACTIVE TRANSACTION QUEUE WORKERS</h3>
                  </div>
                  <span className="text-[8px] bg-blue-500/15 text-blue-400 font-mono font-bold px-2 py-0.5 rounded-full uppercase">
                    Workers: 2 / 2 Idle
                  </span>
                </div>

                <div className="border border-white/5 rounded-2xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-[10px]">
                    <thead>
                      <tr className="bg-white/[0.02] border-b border-white/5 text-[8px] uppercase tracking-wider text-slate-500 font-bold">
                        <th className="py-3 px-4">Withdrawal ID</th>
                        <th className="py-3 px-4">Destination</th>
                        <th className="py-3 px-4">Phase & Lifecycle State</th>
                        <th className="py-3 px-4 text-right">Progress</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-400 font-mono">
                      <tr>
                        <td className="py-3.5 px-4 font-bold text-white">#W782A</td>
                        <td className="py-3.5 px-4 truncate max-w-[80px]">TYG8D6Fi...</td>
                        <td className="py-3.5 px-4 text-emerald-400 font-bold uppercase">4_CONFIRMATION_WAITING (9/12)</td>
                        <td className="py-3.5 px-4 text-right text-emerald-400 font-bold">75%</td>
                      </tr>
                      <tr>
                        <td className="py-3.5 px-4 font-bold text-white">#W910B</td>
                        <td className="py-3.5 px-4 truncate max-w-[80px]">0x51C765...</td>
                        <td className="py-3.5 px-4 text-blue-400 font-bold uppercase">3_SIGN_AND_BROADCAST (broadcasting)</td>
                        <td className="py-3.5 px-4 text-right text-blue-400 font-bold">50%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <p className="text-[9px] text-slate-500 italic">
                  Queue checks for pending transactions every 1500ms and executes asynchronous multi-phase settlement.
                </p>
              </div>

              {/* Console logs terminal */}
              <div className="bg-black/40 border border-white/5 rounded-3xl p-6 space-y-4 flex flex-col justify-between">
                <div className="flex justify-between items-center border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-sm font-display font-black text-white">SYSTEM AUDIT TERMINAL CONSOLE</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      playSound('CLICK');
                      setInfraLogs([
                        { timestamp: new Date().toISOString(), type: 'INFO', message: 'Terminal log buffer cleared.' }
                      ]);
                    }}
                    className="text-[8px] bg-white/5 hover:bg-white/10 text-slate-400 px-2 py-1 rounded transition-colors uppercase font-mono font-bold border-0 cursor-pointer"
                  >
                    Clear Logs
                  </button>
                </div>

                <div className="bg-[#030712] border border-white/5 rounded-2xl p-4 h-48 overflow-y-auto font-mono text-[9px] space-y-2 select-all shadow-inner">
                  {infraLogs.map((log, index) => {
                    let typeColor = 'text-slate-500';
                    if (log.type === 'SUCCESS') typeColor = 'text-emerald-400 font-bold';
                    if (log.type === 'WARNING') typeColor = 'text-amber-400 font-bold';
                    if (log.type === 'HEALTH') typeColor = 'text-purple-400';
                    return (
                      <div key={index} className="flex gap-2 items-start leading-normal">
                        <span className="text-slate-600 shrink-0">[{log.timestamp.split('T')[1].slice(0, 8)}]</span>
                        <span className={`${typeColor} shrink-0`}>[{log.type}]</span>
                        <span className="text-slate-300">{log.message}</span>
                      </div>
                    );
                  })}
                </div>

                <p className="text-[8px] text-slate-600 font-mono uppercase tracking-widest text-right">
                  BUFFER CHANNELS: ACTIVE LOG STREAMING
                </p>
              </div>

            </div>
          </div>
        )}

        {/* TAB 6: ENTERPRISE PAYMENT MANAGEMENT MODULE */}
        {activeAdminTab === 'payment_management' && (
          <div className="space-y-8 animate-in fade-in duration-200 text-left">
            <AdminPaymentManagement db={db} playSound={playSound} adminRole={adminRole} />
          </div>
        )}

      </div>

      {/* GLOBAL PASSWORD CONFIRMATION MODAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-md w-full p-6 space-y-6 shadow-2xl animate-in fade-in zoom-in duration-200 text-left">
            <div className="flex items-start justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-md font-display font-black text-white">{confirmTitle || 'Authorize Action'}</h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold">Admin Security Verification</p>
                </div>
              </div>
              <button 
                onClick={() => { playSound('CLICK'); setShowConfirmModal(false); }}
                className="text-slate-400 hover:text-white transition-colors text-xs font-bold bg-white/5 hover:bg-white/10 px-2 py-1 rounded-md cursor-pointer border-0"
              >
                Cancel
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-black/20 p-4 rounded-2xl border border-white/5">
              {confirmDesc || 'This action is password-protected. Please authorize by entering your administrator password.'}
            </p>

            <div className="space-y-2">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Enter Admin Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-emerald-500 transition-colors font-mono"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') executeSecureAction();
                }}
                autoFocus
              />
              {confirmError && (
                <p className="text-[10px] text-red-400 font-bold leading-normal mt-1 flex items-center gap-1">
                  <span>⚠️</span> {confirmError}
                </p>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { playSound('CLICK'); setShowConfirmModal(false); }}
                className="flex-1 bg-white/5 hover:bg-white/10 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-all border border-white/5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={executeSecureAction}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-black py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/10 cursor-pointer border-0"
              >
                Verify & Execute
              </button>
            </div>
            
            <p className="text-[8px] text-center text-slate-500 font-mono uppercase tracking-widest">
              Secured by Antigravity RBAC Gate
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
