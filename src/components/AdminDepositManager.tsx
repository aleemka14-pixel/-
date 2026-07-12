import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, SlidersHorizontal, Plus, ArrowUp, ArrowDown, 
  Trash2, Edit, Save, Check, RefreshCw, HelpCircle, 
  Upload, ImageIcon, AlertTriangle, Eye, EyeOff,
  Coins, Settings, HelpCircle as HelpIcon, FileText,
  Activity, Sparkles, BookOpen, QrCode
} from 'lucide-react';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase.ts';
import { DepositNetwork, FAQItem } from '../types.ts';
import { DEFAULT_NETWORKS } from '../data/defaultNetworks.ts';

interface AdminDepositManagerProps {
  networks: DepositNetwork[];
  playSound: (key: any) => void;
}

export function AdminDepositManager({ networks = [], playSound }: AdminDepositManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled' | 'maintenance'>('all');
  const [selectedNetworkForContent, setSelectedNetworkForContent] = useState<DepositNetwork | null>(null);
  
  // Save indicator state
  const [saveIndicator, setSaveIndicator] = useState<Record<string, 'saving' | 'saved' | null>>({});

  // Form states for creating a new custom network
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNetId, setNewNetId] = useState('');
  const [newNetName, setNewNetName] = useState('');
  const [newNetAddress, setNewNetAddress] = useState('');

  // Search, filter & sort networks
  const sortedAndFilteredNetworks = useMemo(() => {
    let result = [...networks];
    
    // Filter by search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(n => 
        n.name.toLowerCase().includes(term) || 
        n.id.toLowerCase().includes(term) || 
        n.depositAddress.toLowerCase().includes(term)
      );
    }

    // Filter by status
    if (statusFilter === 'enabled') {
      result = result.filter(n => n.enabled);
    } else if (statusFilter === 'disabled') {
      result = result.filter(n => !n.enabled);
    } else if (statusFilter === 'maintenance') {
      result = result.filter(n => n.statusBadge === 'Maintenance');
    }

    // Sort by priority (ascending)
    return result.sort((a, b) => a.priority - b.priority);
  }, [networks, searchTerm, statusFilter]);

  // Handle inline cellular updates
  const handleCellUpdate = async (networkId: string, field: keyof DepositNetwork, value: any) => {
    const key = `${networkId}-${String(field)}`;
    setSaveIndicator(prev => ({ ...prev, [key]: 'saving' }));
    
    try {
      const netRef = doc(db, 'deposit_networks', networkId);
      await updateDoc(netRef, { [field]: value });
      
      setSaveIndicator(prev => ({ ...prev, [key]: 'saved' }));
      setTimeout(() => {
        setSaveIndicator(prev => ({ ...prev, [key]: null }));
      }, 1500);
    } catch (err) {
      console.error('Error updating cell in Firestore:', err);
      setSaveIndicator(prev => ({ ...prev, [key]: null }));
    }
  };

  // Reorder network priorities (drag-and-drop replacement)
  const handlePriorityShift = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sortedAndFilteredNetworks.length) return;

    playSound('CLICK');
    
    const currentNet = sortedAndFilteredNetworks[index];
    const swapNet = sortedAndFilteredNetworks[targetIndex];

    try {
      const currentRef = doc(db, 'deposit_networks', currentNet.id);
      const swapRef = doc(db, 'deposit_networks', swapNet.id);

      // Swap priorities
      const tempPriority = currentNet.priority;
      await updateDoc(currentRef, { priority: swapNet.priority });
      await updateDoc(swapRef, { priority: tempPriority });
    } catch (err) {
      console.error('Failed to swap network priorities:', err);
    }
  };

  // Create new blockchain network
  const handleCreateNetwork = async () => {
    if (!newNetId || !newNetName || !newNetAddress) return;
    playSound('CLICK');

    const cleanId = newNetId.toLowerCase().replace(/[^a-z0-9]/g, '');
    const priority = networks.length > 0 ? Math.max(...networks.map(n => n.priority)) + 1 : 1;

    const newNetwork: DepositNetwork = {
      id: cleanId,
      name: newNetName,
      logoUrl: '',
      bannerUrl: '',
      title: `${newNetName} Network`,
      subtitle: 'Transfer Protocol',
      description: 'Transfer tokens safely. Fully custom blockchain configuration.',
      networkFeeText: '1.00 (~$1.00)',
      typicalFeeUsd: 1.0,
      estimatedTime: '3 mins',
      confirmations: 1,
      warningMessage: 'Verify your destination network compatibility before dispatch.',
      depositInstructions: 'Send to this address. Confirm the exact network on your sending terminal.',
      faqs: [],
      helpText: 'Reach support line if transfers fail to propagate.',
      maintenanceMessage: 'Network operating under nominal conditions.',
      statusBadge: 'Online',
      enabled: true,
      minDepositUsd: 10,
      maxDepositUsd: 50000,
      depositAddress: newNetAddress,
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${newNetAddress}`,
      priority,
      featured: false,
      supportedCoins: 'USDT, USDC'
    };

    try {
      await setDoc(doc(db, 'deposit_networks', cleanId), newNetwork);
      setShowAddModal(false);
      setNewNetId('');
      setNewNetName('');
      setNewNetAddress('');
      playSound('WIN');
    } catch (e) {
      console.error('Failed to create network document:', e);
    }
  };

  // Delete network
  const handleDeleteNetwork = async (id: string) => {
    if (!confirm(`Are you absolutely certain you want to delete ${id} network? This cannot be undone.`)) return;
    playSound('CLICK');
    try {
      await deleteDoc(doc(db, 'deposit_networks', id));
      if (selectedNetworkForContent?.id === id) {
        setSelectedNetworkForContent(null);
      }
    } catch (e) {
      console.error('Failed to delete network:', e);
    }
  };

  // Restore defaults
  const handleRestoreDefaults = async () => {
    if (!confirm('This will wipe all custom network configurations and reset all 7 default blockchain networks. Proceed?')) return;
    playSound('CLICK');
    
    // Clear existing
    for (const net of networks) {
      try {
        await deleteDoc(doc(db, 'deposit_networks', net.id));
      } catch (e) {
        console.warn(`Error deleting ${net.id}:`, e);
      }
    }

    // Seed defaults
    for (const net of DEFAULT_NETWORKS) {
      try {
        await setDoc(doc(db, 'deposit_networks', net.id), net);
      } catch (e) {
        console.error(`Error re-seeding default network ${net.id}:`, e);
      }
    }
    playSound('WIN');
  };

  // Handle local file uploads (Base64 conversion with automatic canvas compression) for logo & banner & qrCodeUrl
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'bannerUrl' | 'qrCodeUrl', networkId: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Define dynamic target limits and compression quality to minimize footprint
          let maxDim = 300;
          let quality = 0.6;
          if (field === 'logoUrl') {
            maxDim = 120;
            quality = 0.7;
          } else if (field === 'bannerUrl') {
            maxDim = 600;
            quality = 0.5;
          } else if (field === 'qrCodeUrl') {
            maxDim = 250;
            quality = 0.7;
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
            
            await handleCellUpdate(networkId, field, compressedBase64);
            // Refresh details panel state if currently editing
            if (selectedNetworkForContent?.id === networkId) {
              setSelectedNetworkForContent(prev => prev ? { ...prev, [field]: compressedBase64 } : null);
            }
          } else {
            // Fallback to original Base64 if canvas context creation fails
            const originalBase64 = event.target?.result as string;
            await handleCellUpdate(networkId, field, originalBase64);
            if (selectedNetworkForContent?.id === networkId) {
              setSelectedNetworkForContent(prev => prev ? { ...prev, [field]: originalBase64 } : null);
            }
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  // FAQ Manager helpers
  const handleAddFaq = async (network: DepositNetwork) => {
    const updatedFaqs = [...(network.faqs || []), { question: 'New FAQ Question?', answer: 'Answer details here.' }];
    await handleCellUpdate(network.id, 'faqs', updatedFaqs);
    if (selectedNetworkForContent?.id === network.id) {
      setSelectedNetworkForContent(prev => prev ? { ...prev, faqs: updatedFaqs } : null);
    }
  };

  const handleEditFaq = async (network: DepositNetwork, index: number, faqField: 'question' | 'answer', val: string) => {
    const faqs = [...(network.faqs || [])];
    if (faqs[index]) {
      faqs[index] = { ...faqs[index], [faqField]: val };
      await handleCellUpdate(network.id, 'faqs', faqs);
      if (selectedNetworkForContent?.id === network.id) {
        setSelectedNetworkForContent(prev => prev ? { ...prev, faqs } : null);
      }
    }
  };

  const handleDeleteFaq = async (network: DepositNetwork, index: number) => {
    const faqs = (network.faqs || []).filter((_, i) => i !== index);
    await handleCellUpdate(network.id, 'faqs', faqs);
    if (selectedNetworkForContent?.id === network.id) {
      setSelectedNetworkForContent(prev => prev ? { ...prev, faqs } : null);
    }
  };

  return (
    <div className="space-y-8">
      {/* Upper Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-950 border border-white/5 p-6 rounded-3xl">
        <div className="space-y-1">
          <h2 className="text-2xl font-display font-black text-white flex items-center gap-2">
            <Settings className="w-6 h-6 text-emerald-400" />
            Dynamic Deposit Protocol Manager
          </h2>
          <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">
            Real-time spreadsheet-style configuration engine
          </p>
        </div>
        <div className="flex gap-2.5 w-full sm:w-auto">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer border-0"
          >
            <Plus className="w-4 h-4" />
            New Network
          </button>
          <button
            onClick={handleRestoreDefaults}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-slate-300 hover:text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Restore Defaults
          </button>
        </div>
      </div>

      {/* Spreadsheet + Detail splits */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        {/* Left Column: Spreadsheet Table (8 cols or 12 cols if no network selected) */}
        <div className={`${selectedNetworkForContent ? 'xl:col-span-7' : 'xl:col-span-12'} space-y-4 transition-all duration-300`}>
          
          {/* Filtering row */}
          <div className="flex flex-col md:flex-row justify-between gap-4 bg-slate-950/40 p-4 border border-white/5 rounded-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by blockchain name, ID, or wallet address..."
                className="w-full bg-slate-950 border border-white/5 rounded-xl pl-10 pr-4 py-3 text-xs text-white focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto">
              {(['all', 'enabled', 'disabled', 'maintenance'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => { setStatusFilter(filter); playSound('CLICK'); }}
                  className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border-0 cursor-pointer ${
                    statusFilter === filter 
                      ? 'bg-emerald-500 text-black' 
                      : 'bg-white/5 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {/* Spreadsheet Table Frame */}
          <div className="bg-slate-950 border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-[11px] text-slate-300 min-w-[1100px]">
                <thead>
                  <tr className="bg-white/[0.02] text-slate-500 uppercase tracking-widest text-[9px] border-b border-white/5 font-bold">
                    <th className="p-4 text-center w-12">Move</th>
                    <th className="p-4 w-52">Blockchain & Logo</th>
                    <th className="p-4 text-center w-20">Enabled</th>
                    <th className="p-4 text-center w-24">Min Dep.</th>
                    <th className="p-4 text-center w-24">Max Dep.</th>
                    <th className="p-4 w-32">Typical Fee</th>
                    <th className="p-4 w-28">Est. Speed</th>
                    <th className="p-4 text-center w-16">Conf.</th>
                    <th className="p-4 w-60">Deposit Destination</th>
                    <th className="p-4 text-center w-24">Status</th>
                    <th className="p-4 text-center w-24">Featured</th>
                    <th className="p-4 text-center w-36">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {sortedAndFilteredNetworks.map((net, idx) => {
                    const isSelected = selectedNetworkForContent?.id === net.id;
                    return (
                      <tr 
                        key={net.id}
                        className={`hover:bg-white/[0.01] transition-colors ${
                          isSelected ? 'bg-emerald-500/[0.02]' : ''
                        }`}
                      >
                        {/* Priority shift controls */}
                        <td className="p-3">
                          <div className="flex flex-col items-center gap-1.5">
                            <button
                              disabled={idx === 0}
                              onClick={() => handlePriorityShift(idx, 'up')}
                              className="p-1 bg-white/5 hover:bg-emerald-500 hover:text-black rounded transition-all disabled:opacity-20 disabled:pointer-events-none cursor-pointer border-0"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              disabled={idx === sortedAndFilteredNetworks.length - 1}
                              onClick={() => handlePriorityShift(idx, 'down')}
                              className="p-1 bg-white/5 hover:bg-emerald-500 hover:text-black rounded transition-all disabled:opacity-20 disabled:pointer-events-none cursor-pointer border-0"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                        </td>

                        {/* Logo & Name Cellular Edit */}
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            <div className="relative group w-10 h-10 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                              {net.logoUrl ? (
                                <img src={net.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                              ) : (
                                <ImageIcon className="w-4 h-4 text-slate-600" />
                              )}
                              <label className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer transition-opacity">
                                <Upload className="w-3 h-3 text-white" />
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => handleImageFileChange(e, 'logoUrl', net.id)}
                                />
                              </label>
                            </div>
                            <div className="flex-1 min-w-0">
                              <input
                                type="text"
                                value={net.name}
                                onChange={(e) => handleCellUpdate(net.id, 'name', e.target.value)}
                                className="bg-transparent border-0 focus:ring-1 focus:ring-emerald-500/50 hover:bg-white/5 rounded px-1.5 py-1 text-xs font-bold text-white w-full truncate"
                              />
                              <p className="text-[10px] text-slate-600 px-1.5">ID: {net.id}</p>
                            </div>
                          </div>
                        </td>

                        {/* Enabled switch toggle */}
                        <td className="p-3 text-center">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={net.enabled}
                              onChange={(e) => handleCellUpdate(net.id, 'enabled', e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500 peer-checked:after:bg-black peer-checked:after:border-black" />
                          </label>
                        </td>

                        {/* Min deposit Cellular Edit */}
                        <td className="p-3">
                          <div className="relative">
                            <input
                              type="number"
                              value={net.minDepositUsd}
                              onChange={(e) => handleCellUpdate(net.id, 'minDepositUsd', Number(e.target.value))}
                              className="bg-transparent border-0 focus:ring-1 focus:ring-emerald-500/50 hover:bg-white/5 rounded px-1.5 py-1 text-right text-xs text-emerald-400 font-bold w-full"
                            />
                            {saveIndicator[`${net.id}-minDepositUsd`] === 'saving' && (
                              <span className="absolute right-0 top-0 text-[8px] text-slate-500">...</span>
                            )}
                          </div>
                        </td>

                        {/* Max deposit Cellular Edit */}
                        <td className="p-3">
                          <input
                            type="number"
                            value={net.maxDepositUsd}
                            onChange={(e) => handleCellUpdate(net.id, 'maxDepositUsd', Number(e.target.value))}
                            className="bg-transparent border-0 focus:ring-1 focus:ring-emerald-500/50 hover:bg-white/5 rounded px-1.5 py-1 text-right text-xs text-white font-bold w-full"
                          />
                        </td>

                        {/* Fee Cellular Edit */}
                        <td className="p-3">
                          <input
                            type="text"
                            value={net.networkFeeText}
                            onChange={(e) => handleCellUpdate(net.id, 'networkFeeText', e.target.value)}
                            className="bg-transparent border-0 focus:ring-1 focus:ring-emerald-500/50 hover:bg-white/5 rounded px-1.5 py-1 text-xs text-white font-bold w-full"
                          />
                        </td>

                        {/* Speed Cellular Edit */}
                        <td className="p-3">
                          <input
                            type="text"
                            value={net.estimatedTime}
                            onChange={(e) => handleCellUpdate(net.id, 'estimatedTime', e.target.value)}
                            className="bg-transparent border-0 focus:ring-1 focus:ring-emerald-500/50 hover:bg-white/5 rounded px-1.5 py-1 text-xs text-white font-bold w-full"
                          />
                        </td>

                        {/* Confirmations Cellular Edit */}
                        <td className="p-3 text-center">
                          <input
                            type="number"
                            value={net.confirmations}
                            onChange={(e) => handleCellUpdate(net.id, 'confirmations', Number(e.target.value))}
                            className="bg-transparent border-0 focus:ring-1 focus:ring-emerald-500/50 hover:bg-white/5 rounded px-1.5 py-1 text-center text-xs text-white font-bold w-full"
                          />
                        </td>

                        {/* Destination Address Cellular Edit */}
                        <td className="p-3">
                          <input
                            type="text"
                            value={net.depositAddress}
                            onChange={(e) => {
                              const addr = e.target.value;
                              handleCellUpdate(net.id, 'depositAddress', addr);
                              // Auto regenerate standard QR code API
                              handleCellUpdate(net.id, 'qrCodeUrl', `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${addr}`);
                            }}
                            className="bg-transparent border-0 focus:ring-1 focus:ring-emerald-500/50 hover:bg-white/5 rounded px-1.5 py-1 text-xs text-emerald-400 font-bold font-mono w-full truncate"
                          />
                        </td>

                        {/* Status (Online/Maintenance) Switch */}
                        <td className="p-3 text-center">
                          <button
                            onClick={() => {
                              const nextStatus = net.statusBadge === 'Online' ? 'Maintenance' : 'Online';
                              handleCellUpdate(net.id, 'statusBadge', nextStatus);
                              playSound('CLICK');
                            }}
                            className={`px-2 py-1 rounded text-[9px] font-bold border cursor-pointer ${
                              net.statusBadge === 'Online'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                            }`}
                          >
                            {net.statusBadge}
                          </button>
                        </td>

                        {/* Featured (Popular) toggle */}
                        <td className="p-3 text-center">
                          <button
                            onClick={() => {
                              handleCellUpdate(net.id, 'featured', !net.featured);
                              playSound('CLICK');
                            }}
                            className={`p-1 rounded transition-all cursor-pointer border-0 ${
                              net.featured ? 'text-purple-400 bg-purple-500/15' : 'text-slate-600 bg-white/5'
                            }`}
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                          </button>
                        </td>

                        {/* Actions */}
                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedNetworkForContent(net);
                                playSound('CLICK');
                              }}
                              className={`p-2 rounded-xl transition-all border cursor-pointer flex items-center gap-1 text-[10px] uppercase font-black tracking-wider ${
                                isSelected 
                                  ? 'bg-emerald-500 text-black border-emerald-500 font-bold' 
                                  : 'bg-white/5 hover:bg-white/15 text-slate-300 border-white/5 hover:border-white/10'
                              }`}
                              title="Edit Full Page Content"
                            >
                              <Edit className="w-3.5 h-3.5" />
                              Details
                            </button>
                            <button
                              onClick={() => handleDeleteNetwork(net.id)}
                              className="p-2 bg-rose-500/10 hover:bg-rose-500 hover:text-black text-rose-400 rounded-xl transition-all cursor-pointer border-0"
                              title="Delete Network"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {sortedAndFilteredNetworks.length === 0 && (
              <div className="p-16 text-center text-slate-600 italic font-display">
                No networks found matching filters.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Deposit Content Manager Panel (5 cols) */}
        <AnimatePresence>
          {selectedNetworkForContent && (
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              className="xl:col-span-5 bg-slate-950 border border-white/5 rounded-[2rem] p-6 space-y-6 shadow-2xl h-fit"
            >
              <div className="flex justify-between items-start border-b border-white/5 pb-4">
                <div>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest font-mono">CONTENT EDITOR</span>
                  <h3 className="text-xl font-display font-black text-white">{selectedNetworkForContent.name}</h3>
                </div>
                <button
                  onClick={() => setSelectedNetworkForContent(null)}
                  className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-all text-xs font-mono font-bold cursor-pointer border-0"
                >
                  Close
                </button>
              </div>

              {/* Form Scroll Area */}
              <div className="space-y-6 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
                
                {/* Banner Image management */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">
                    Header Banner Image
                  </label>
                  <div className="relative h-28 w-full bg-slate-900 rounded-2xl overflow-hidden border border-white/5 group">
                    {selectedNetworkForContent.bannerUrl ? (
                      <img src={selectedNetworkForContent.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-1.5">
                        <ImageIcon className="w-6 h-6 opacity-30" />
                        <span className="text-[9px] font-black uppercase">No Banner Image</span>
                      </div>
                    )}
                    <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity text-white gap-1">
                      <Upload className="w-4 h-4" />
                      <span className="text-[9px] font-black uppercase">Upload/Replace Banner</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleImageFileChange(e, 'bannerUrl', selectedNetworkForContent.id)}
                      />
                    </label>
                  </div>
                  {selectedNetworkForContent.bannerUrl && (
                    <button
                      onClick={() => handleCellUpdate(selectedNetworkForContent.id, 'bannerUrl', '')}
                      className="text-[10px] text-rose-400 hover:text-rose-300 font-mono flex items-center gap-1 cursor-pointer bg-transparent border-0"
                    >
                      <Trash2 className="w-3 h-3" /> Remove banner
                    </button>
                  )}
                </div>

                {/* QR Code Image management */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">
                    Payment QR Code Image
                  </label>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                    <div className="relative h-24 w-24 bg-slate-900 rounded-2xl overflow-hidden border border-white/5 group shrink-0 flex items-center justify-center">
                      {selectedNetworkForContent.qrCodeUrl ? (
                        <img src={selectedNetworkForContent.qrCodeUrl} alt="QR Code" className="w-full h-full object-contain p-2" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-1">
                          <QrCode className="w-6 h-6 opacity-30" />
                          <span className="text-[8px] font-black uppercase">No QR Code</span>
                        </div>
                      )}
                      <label className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity text-white gap-1 text-center p-1">
                        <Upload className="w-4 h-4" />
                        <span className="text-[8px] font-black uppercase">Upload QR</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleImageFileChange(e, 'qrCodeUrl', selectedNetworkForContent.id)}
                        />
                      </label>
                    </div>
                    <div className="space-y-1.5 flex-1">
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Upload a custom payment QR code image or reset to the default auto-generated QR code (which encodes the deposit address below).
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedNetworkForContent.qrCodeUrl && (
                          <button
                            onClick={async () => {
                              await handleCellUpdate(selectedNetworkForContent.id, 'qrCodeUrl', '');
                              setSelectedNetworkForContent(prev => prev ? { ...prev, qrCodeUrl: '' } : null);
                              playSound('CLICK');
                            }}
                            className="text-[9px] text-rose-400 hover:text-rose-300 font-mono flex items-center gap-1 cursor-pointer bg-transparent border-0"
                          >
                            <Trash2 className="w-3 h-3" /> Remove QR Code
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            const autoUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${selectedNetworkForContent.depositAddress || ''}`;
                            await handleCellUpdate(selectedNetworkForContent.id, 'qrCodeUrl', autoUrl);
                            setSelectedNetworkForContent(prev => prev ? { ...prev, qrCodeUrl: autoUrl } : null);
                            playSound('WIN');
                          }}
                          className="text-[9px] text-emerald-400 hover:text-emerald-300 font-mono flex items-center gap-1 cursor-pointer bg-transparent border-0"
                        >
                          <RefreshCw className="w-3 h-3" /> Reset to Auto-QR
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Basic descriptive texts */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">
                      Marketing Title
                    </label>
                    <input
                      type="text"
                      value={selectedNetworkForContent.title}
                      onChange={(e) => {
                        handleCellUpdate(selectedNetworkForContent.id, 'title', e.target.value);
                        setSelectedNetworkForContent(prev => prev ? { ...prev, title: e.target.value } : null);
                      }}
                      className="w-full bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">
                      Subtitle Accent
                    </label>
                    <input
                      type="text"
                      value={selectedNetworkForContent.subtitle}
                      onChange={(e) => {
                        handleCellUpdate(selectedNetworkForContent.id, 'subtitle', e.target.value);
                        setSelectedNetworkForContent(prev => prev ? { ...prev, subtitle: e.target.value } : null);
                      }}
                      className="w-full bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">
                    Short Description
                  </label>
                  <textarea
                    rows={3}
                    value={selectedNetworkForContent.description}
                    onChange={(e) => {
                      handleCellUpdate(selectedNetworkForContent.id, 'description', e.target.value);
                      setSelectedNetworkForContent(prev => prev ? { ...prev, description: e.target.value } : null);
                    }}
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50 font-sans leading-relaxed"
                  />
                </div>

                {/* Warnings, instructions */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-rose-500 uppercase tracking-widest font-mono flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Network Compatibility Warning Message
                  </label>
                  <textarea
                    rows={3}
                    value={selectedNetworkForContent.warningMessage}
                    onChange={(e) => {
                      handleCellUpdate(selectedNetworkForContent.id, 'warningMessage', e.target.value);
                      setSelectedNetworkForContent(prev => prev ? { ...prev, warningMessage: e.target.value } : null);
                    }}
                    className="w-full bg-rose-500/5 border border-rose-500/20 rounded-xl px-3 py-2 text-xs text-rose-300 focus:outline-none focus:border-rose-500/50 font-sans leading-relaxed italic"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">
                    Detailed Step-By-Step Deposit Instructions
                  </label>
                  <textarea
                    rows={4}
                    value={selectedNetworkForContent.depositInstructions}
                    onChange={(e) => {
                      handleCellUpdate(selectedNetworkForContent.id, 'depositInstructions', e.target.value);
                      setSelectedNetworkForContent(prev => prev ? { ...prev, depositInstructions: e.target.value } : null);
                    }}
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50 font-sans leading-relaxed"
                  />
                </div>

                {/* Maintenance Message */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">
                    Maintenance Custom Message (Shown on outage / info banner)
                  </label>
                  <input
                    type="text"
                    value={selectedNetworkForContent.maintenanceMessage}
                    onChange={(e) => {
                      handleCellUpdate(selectedNetworkForContent.id, 'maintenanceMessage', e.target.value);
                      setSelectedNetworkForContent(prev => prev ? { ...prev, maintenanceMessage: e.target.value } : null);
                    }}
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                  />
                </div>

                {/* Supported Coins field */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">
                    Supported Settlement Coins (Comma separated, e.g. "USDT, USDC")
                  </label>
                  <input
                    type="text"
                    value={selectedNetworkForContent.supportedCoins || ''}
                    onChange={(e) => {
                      handleCellUpdate(selectedNetworkForContent.id, 'supportedCoins', e.target.value);
                      setSelectedNetworkForContent(prev => prev ? { ...prev, supportedCoins: e.target.value } : null);
                    }}
                    placeholder="USDT, USDC"
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50 font-mono"
                  />
                </div>

                {/* FAQ Manager */}
                <div className="border-t border-white/5 pt-4 space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                      Dynamic Accordion FAQs ({selectedNetworkForContent.faqs?.length || 0})
                    </label>
                    <button
                      onClick={() => handleAddFaq(selectedNetworkForContent)}
                      className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-400 hover:text-black font-black uppercase text-[9px] tracking-wider rounded-lg transition-all cursor-pointer border-0"
                    >
                      Add Question
                    </button>
                  </div>

                  <div className="space-y-3">
                    {(selectedNetworkForContent.faqs || []).map((faq, fIdx) => (
                      <div key={fIdx} className="bg-white/[0.01] border border-white/5 p-3 rounded-2xl space-y-2 relative">
                        <button
                          onClick={() => handleDeleteFaq(selectedNetworkForContent, fIdx)}
                          className="absolute top-2 right-2 p-1.5 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-black rounded-lg transition-all border-0 cursor-pointer"
                          title="Delete FAQ Item"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        <div className="space-y-1">
                          <span className="text-[8px] font-black text-slate-600 uppercase font-mono">Question {fIdx + 1}</span>
                          <input
                            type="text"
                            value={faq.question}
                            onChange={(e) => handleEditFaq(selectedNetworkForContent, fIdx, 'question', e.target.value)}
                            className="w-full bg-transparent border-0 focus:ring-1 focus:ring-emerald-500/50 hover:bg-white/5 rounded px-2 py-1 text-xs text-white font-bold"
                          />
                        </div>
                        <div className="space-y-1">
                          <span className="text-[8px] font-black text-slate-600 uppercase font-mono">Answer</span>
                          <textarea
                            rows={2}
                            value={faq.answer}
                            onChange={(e) => handleEditFaq(selectedNetworkForContent, fIdx, 'answer', e.target.value)}
                            className="w-full bg-transparent border-0 focus:ring-1 focus:ring-emerald-500/50 hover:bg-white/5 rounded px-2 py-1 text-xs text-slate-400 italic"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Help text */}
                <div className="space-y-2 border-t border-white/5 pt-4">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">
                    Help Desk Text / Callout
                  </label>
                  <input
                    type="text"
                    value={selectedNetworkForContent.helpText}
                    onChange={(e) => {
                      handleCellUpdate(selectedNetworkForContent.id, 'helpText', e.target.value);
                      setSelectedNetworkForContent(prev => prev ? { ...prev, helpText: e.target.value } : null);
                    }}
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50 italic"
                  />
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Creation Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-950 border border-white/10 p-8 rounded-[2rem] w-full max-w-md space-y-6">
            <div>
              <h3 className="text-2xl font-display font-black text-white">Create Custom Blockchain</h3>
              <p className="text-xs text-slate-500 font-mono uppercase tracking-wider mt-1">Register new ledger network</p>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Unique Key ID (alphanumeric)</label>
                <input
                  type="text"
                  placeholder="e.g. avalanche"
                  value={newNetId}
                  onChange={(e) => setNewNetId(e.target.value)}
                  className="w-full bg-white/5 border border-white/5 focus:border-emerald-500/50 rounded-xl px-4 py-3 text-xs text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Network Display Name</label>
                <input
                  type="text"
                  placeholder="e.g. Avalanche C-Chain"
                  value={newNetName}
                  onChange={(e) => setNewNetName(e.target.value)}
                  className="w-full bg-white/5 border border-white/5 focus:border-emerald-500/50 rounded-xl px-4 py-3 text-xs text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Deposit Destination Address</label>
                <input
                  type="text"
                  placeholder="e.g. 0x93b4a2df8..."
                  value={newNetAddress}
                  onChange={(e) => setNewNetAddress(e.target.value)}
                  className="w-full bg-white/5 border border-white/5 focus:border-emerald-500/50 rounded-xl px-4 py-3 text-xs text-emerald-400 font-mono"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleCreateNetwork}
                className="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase tracking-widest text-[10px] rounded-xl transition-all cursor-pointer border-0"
              >
                Deploy Network
              </button>
              <button
                onClick={() => { setShowAddModal(false); playSound('CLICK'); }}
                className="flex-1 py-3.5 bg-white/5 hover:bg-white/10 text-slate-300 font-black uppercase tracking-widest text-[10px] rounded-xl transition-all cursor-pointer border border-white/5"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
