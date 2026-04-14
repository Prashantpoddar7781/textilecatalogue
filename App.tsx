import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Package, CheckCircle, SlidersHorizontal, LogOut, User, Crown, BarChart3, Menu, MessageCircle, Link2 } from 'lucide-react';
import { TextileDesign, CatalogueFilters, SubscriptionStatus } from './types';
import { UploadForm } from './components/UploadForm';
import { DesignCard } from './components/DesignCard';
import { DesignFullscreenModal } from './components/DesignFullscreenModal';
import { ShareDialog } from './components/ShareDialog';
import { ShareLinkDialog } from './components/ShareLinkDialog';
import { ShareView } from './components/ShareView';
import { BarcodeDesignView } from './components/BarcodeDesignView';
import { OrdersPage } from './components/OrdersPage';
import { ShareStatsPage } from './components/ShareStatsPage';
import { LoginDialog } from './components/LoginDialog';
import { PricingDialog } from './components/PricingDialog';
import { BillingPage } from './components/BillingPage';
import { designsApi, authApi, shareLinksApi, ordersApi, billingApi } from './services/api';
import { Order } from './types';

const App: React.FC = () => {
  // Check if we're on a share route
  const pathname = window.location.pathname;
  const shareMatch = pathname.match(/^\/share\/([^/]+)$/);
  const barcodeMatch = pathname.match(/^\/barcode\/([^/]+)$/);
  const ordersMatch = pathname.match(/^\/orders\/?$/);
  const billingMatch = pathname.match(/^\/billing\/?$/);
  const shareStatsMatch = pathname.match(/^\/share-stats\/?$/);
  
  if (shareMatch) {
    const token = shareMatch[1];
    return <ShareView token={token} />;
  }
  if (barcodeMatch) {
    const designId = barcodeMatch[1];
    return <BarcodeDesignView designId={designId} />;
  }
  const [designs, setDesigns] = useState<TextileDesign[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isShareLinkOpen, setIsShareLinkOpen] = useState(false);
  const [selectedDesignForLink, setSelectedDesignForLink] = useState<TextileDesign | null>(null);
  const [viewingDesign, setViewingDesign] = useState<TextileDesign | null>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isSharingCollection, setIsSharingCollection] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [isPricingOpen, setIsPricingOpen] = useState(false);
  const [fabrics, setFabrics] = useState<string[]>(['All']);
  const [catalogues, setCatalogues] = useState<{ id: string; name: string }[]>([]);
  const [filters, setFilters] = useState<CatalogueFilters>({
    search: '',
    fabric: 'All',
    catalogue: 'All',
    minPrice: 0,
    maxPrice: 100000,
    sortBy: 'newest'
  });

  // Check authentication on mount
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      authApi.getCurrentUser()
        .then(({ user }) => {
          setUser(user);
          loadDesigns();
        })
        .catch(() => {
          localStorage.removeItem('auth_token');
          setIsLoginOpen(true);
        })
        .finally(() => setIsReady(true));
    } else {
      setIsReady(true);
      setIsLoginOpen(true);
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      setIsPricingOpen(true);
    };
    window.addEventListener('subscription-required', handler as EventListener);
    return () => window.removeEventListener('subscription-required', handler as EventListener);
  }, []);

  // Load orders when user is available
  useEffect(() => {
    if (user) {
      loadOrders();
    }
  }, [user]);

  const refreshSubscription = async () => {
    if (!user) return;
    try {
      const { subscription: status } = await billingApi.getStatus();
      setSubscription(status);
      if (status?.needsPayment) {
        setIsPricingOpen(true);
      }
    } catch (error) {
      console.warn('Failed to load subscription status', error);
    }
  };

  useEffect(() => {
    refreshSubscription();
  }, [user]);

  // Load designs from API
  const loadDesigns = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const params: any = {
        sortBy: filters.sortBy,
        page: 1,
        limit: 1000
      };

      if (filters.fabric !== 'All') params.fabric = filters.fabric;
      if (filters.catalogue !== 'All') params.catalogue = filters.catalogue;
      if (filters.minPrice > 0) params.minPrice = filters.minPrice;
      if (filters.maxPrice < 100000) params.maxPrice = filters.maxPrice;
      if (filters.search) params.search = filters.search;

      const { designs: fetchedDesigns } = await designsApi.getAll(params);
      setDesigns(fetchedDesigns.map((d: any) => ({
        id: d.id,
        name: d.name || 'Untitled Design',
        catalogueId: d.catalogueId,
        catalogueName: d.catalogue?.name,
        image: d.image,
        designCode: d.designCode,
        color: d.color,
        stockQuantity: d.stockQuantity,
        stockUnit: d.stockUnit,
        pcsPerParcel: d.pcsPerParcel,
        moq: d.moq,
        basePrice: d.basePrice || d.retailPrice || 0,
        additionalPrices: d.additionalPrices,
        wholesalePrice: d.wholesalePrice || d.basePrice || d.retailPrice || 0,
        retailPrice: d.retailPrice || d.basePrice || 0,
        fabric: d.fabric,
        description: d.description || '',
        firmName: d.user?.firmName,
        createdAt: new Date(d.createdAt).getTime(),
        aiModels: d.aiModels as string[] | undefined
      })));

      // Load fabrics and catalogues for filter
      const [fabricsResult, cataloguesResult] = await Promise.all([
        designsApi.getFabrics(),
        designsApi.getCatalogues()
      ]);
      setFabrics(['All', ...fabricsResult.fabrics]);
      setCatalogues(cataloguesResult.catalogues);
    } catch (error: any) {
      console.error('Failed to load designs:', error);
      alert('Failed to load designs: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // Reload designs when filters change
  useEffect(() => {
    if (user && isReady) {
      const timeoutId = setTimeout(() => {
        loadDesigns();
      }, 300); // Debounce
      return () => clearTimeout(timeoutId);
    }
  }, [filters, user]);

  const maxPrice = useMemo(() => {
    if (designs.length === 0) return 100000;
    return Math.max(...designs.map(d => d.retailPrice), 100000);
  }, [designs]);

  const filteredDesigns = useMemo(() => {
    return designs.filter(d => {
      const matchesSearch = (d.description?.toLowerCase() || '').includes(filters.search.toLowerCase()) || 
                           (d.fabric?.toLowerCase() || '').includes(filters.search.toLowerCase()) ||
                           (d.name?.toLowerCase() || '').includes(filters.search.toLowerCase());
      const matchesFabric = filters.fabric === 'All' || d.fabric === filters.fabric;
      const matchesCatalogue = filters.catalogue === 'All' || d.catalogueId === filters.catalogue;
      const matchesPrice = d.retailPrice >= filters.minPrice && d.retailPrice <= filters.maxPrice;
      return matchesSearch && matchesFabric && matchesCatalogue && matchesPrice;
    });
  }, [designs, filters]);

  useEffect(() => {
    if (designs.length > 0) {
      const newMax = Math.max(...designs.map(d => d.retailPrice), 100000);
      if (filters.maxPrice === 100000 || filters.maxPrice > newMax) {
        setFilters(f => ({ ...f, maxPrice: newMax }));
      }
    }
  }, [designs.length, filters.maxPrice]);

  const handleAddDesign = async (design: TextileDesign) => {
    try {
      const created = await designsApi.create({
        name: design.name,
        image: design.image,
        designCode: design.designCode,
        color: design.color,
        stockQuantity: design.stockQuantity,
        stockUnit: design.stockUnit,
        pcsPerParcel: design.pcsPerParcel,
        moq: design.moq,
        basePrice: design.basePrice,
        additionalPrices: design.additionalPrices?.map(ap => ({
          name: ap.name,
          type: ap.type,
          value: ap.value,
          ...(typeof ap.calculatedPrice === 'number' && Number.isFinite(ap.calculatedPrice)
            ? { calculatedPrice: ap.calculatedPrice }
            : {})
        })),
        fabric: design.fabric,
        description: design.description,
        catalogueId: design.catalogueId,
        aiModels: design.aiModels
      });
      
      setDesigns(prev => [{
        id: created.id,
        name: created.name || 'Untitled Design',
        catalogueId: created.catalogueId,
        catalogueName: created.catalogue?.name,
        image: created.image,
        designCode: created.designCode,
        color: created.color,
        stockQuantity: created.stockQuantity,
        stockUnit: created.stockUnit,
        pcsPerParcel: created.pcsPerParcel,
        moq: created.moq,
        basePrice: created.basePrice || created.retailPrice || 0,
        additionalPrices: created.additionalPrices,
        wholesalePrice: created.wholesalePrice || created.basePrice || 0,
        retailPrice: created.retailPrice || created.basePrice || 0,
        fabric: created.fabric,
        description: created.description || '',
        firmName: created.user?.firmName,
        createdAt: new Date(created.createdAt).getTime(),
        aiModels: created.aiModels as string[] | undefined
      }, ...prev]);
      setIsUploadOpen(false);
      // Reload catalogues in case new one was created
      const { catalogues: cats } = await designsApi.getCatalogues();
      setCatalogues(cats);
    } catch (error: any) {
      alert('Failed to create design: ' + (error.message || 'Unknown error'));
    }
  };

  const [editingDesign, setEditingDesign] = useState<TextileDesign | null>(null);

  const handleEditDesign = (design: TextileDesign) => {
    setEditingDesign(design);
    setIsUploadOpen(true);
  };

  const handleUpdateDesign = async (design: TextileDesign) => {
    if (!editingDesign) return;
    
    try {
      const updated = await designsApi.update(editingDesign.id, {
        name: design.name,
        image: design.image,
        designCode: design.designCode,
        color: design.color,
        stockQuantity: design.stockQuantity,
        stockUnit: design.stockUnit,
        pcsPerParcel: design.pcsPerParcel,
        moq: design.moq,
        basePrice: design.basePrice,
        additionalPrices: design.additionalPrices?.map(ap => ({
          name: ap.name,
          type: ap.type,
          value: ap.value,
          ...(typeof ap.calculatedPrice === 'number' && Number.isFinite(ap.calculatedPrice)
            ? { calculatedPrice: ap.calculatedPrice }
            : {})
        })),
        fabric: design.fabric,
        description: design.description,
        catalogueId: design.catalogueId,
        aiModels: design.aiModels
      });
      
      setDesigns(prev => prev.map(d => 
        d.id === editingDesign.id ? {
          id: updated.id,
          name: updated.name || 'Untitled Design',
          catalogueId: updated.catalogueId,
          catalogueName: updated.catalogue?.name,
          image: updated.image,
          designCode: updated.designCode,
          color: updated.color,
          stockQuantity: updated.stockQuantity,
          stockUnit: updated.stockUnit,
          pcsPerParcel: updated.pcsPerParcel,
          moq: updated.moq,
          basePrice: updated.basePrice || updated.retailPrice || 0,
          additionalPrices: updated.additionalPrices,
          wholesalePrice: updated.wholesalePrice || updated.basePrice || 0,
          retailPrice: updated.retailPrice || updated.basePrice || 0,
          fabric: updated.fabric,
          description: updated.description || '',
          firmName: updated.user?.firmName,
          createdAt: new Date(updated.createdAt).getTime(),
          aiModels: updated.aiModels as string[] | undefined
        } : d
      ));
      setIsUploadOpen(false);
      setEditingDesign(null);
      // Reload catalogues in case new one was created
      const { catalogues: cats } = await designsApi.getCatalogues();
      setCatalogues(cats);
    } catch (error: any) {
      alert('Failed to update design: ' + (error.message || 'Unknown error'));
    }
  };

  const handleDeleteDesign = async (id: string) => {
    if (!confirm('Permanently remove this design from your inventory?')) return;
    
    try {
      await designsApi.delete(id);
      setDesigns(prev => prev.filter(d => d.id !== id));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (error: any) {
      alert('Failed to delete design: ' + (error.message || 'Unknown error'));
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleLoginSuccess = (token: string, userData: any) => {
    setUser(userData);
    setIsLoginOpen(false);
    loadDesigns();
    loadOrders();
    refreshSubscription();
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    setUser(null);
    setDesigns([]);
    setOrders([]);
    setSubscription(null);
    setIsPricingOpen(false);
    setIsLoginOpen(true);
  };

  const loadOrders = async () => {
    if (!user) return;
    try {
      setLoadingOrders(true);
      const { orders: fetchedOrders } = await ordersApi.getAll();
      setOrders(fetchedOrders);
    } catch (error: any) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleShareCollection = async () => {
    try {
      setIsSharingCollection(true);
      const shareLink = await shareLinksApi.createCollection();
      const shareUrl = `${window.location.origin}/share/${shareLink.token}`;
      try {
        await navigator.clipboard.writeText(shareUrl);
      } catch (e) {
        console.warn('Clipboard write failed:', e);
      }
      const waUrl = `https://wa.me/?text=${encodeURIComponent(shareUrl)}`;
      const newWindow = window.open(waUrl, '_blank');
      if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
        window.location.href = waUrl;
      }
    } catch (error: any) {
      alert('Failed to create collection link: ' + (error.message || 'Unknown error'));
    } finally {
      setIsSharingCollection(false);
    }
  };

  const selectedDesigns = designs.filter(d => selectedIds.has(d.id));
  const inStockSelectedDesigns = selectedDesigns.filter(d => (d.stockQuantity ?? 0) > 0);
  const trialDaysLeft = subscription?.trialEndsAt
    ? Math.max(Math.ceil((new Date(subscription.trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)), 0)
    : null;

  if (!user) {
    return (
      <>
        <div className="min-h-screen bg-[#FDFDFF] flex items-center justify-center">
          <div className="text-center">
            <div className="bg-indigo-600 p-4 rounded-2xl inline-block mb-4">
              <Package className="text-white w-12 h-12" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 mb-2">TextileHub</h1>
            <p className="text-gray-500">Please login to continue</p>
          </div>
        </div>
        {isLoginOpen && <LoginDialog onClose={() => {}} onSuccess={handleLoginSuccess} />}
      </>
    );
  }

  if (ordersMatch) {
    return <OrdersPage onBack={() => { window.location.href = '/'; }} />;
  }

  if (billingMatch) {
    return (
      <BillingPage
        user={user}
        subscription={subscription}
        refreshSubscription={refreshSubscription}
        onBack={() => { window.location.href = '/'; }}
      />
    );
  }

  if (shareStatsMatch) {
    return <ShareStatsPage onBack={() => { window.location.href = '/'; }} />;
  }

  return (
    <div className="min-h-screen bg-[#FDFDFF] pb-28 md:pb-6">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b shadow-sm safe-area-top">
        <div className="max-w-7xl mx-auto px-4 py-3 md:px-8">
          {/* Mobile header */}
          <div className="flex flex-col gap-3 md:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="bg-indigo-600 p-2 rounded-xl shadow-indigo-200 shadow-xl transform rotate-3 shrink-0">
                  <Package className="text-white w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg font-black text-gray-900 tracking-tight leading-none truncate">TextileHub</h1>
                  <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Catalogue</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(true)}
                  className="touch-target flex items-center gap-1.5 bg-gray-900 text-white px-4 rounded-2xl font-bold text-sm shadow-lg active:scale-95"
                  aria-label="Add design"
                >
                  <Plus className="w-5 h-5" />
                  <span>Add</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="touch-target flex items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-800 shadow-sm"
                  aria-label="Menu"
                >
                  <Menu className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="search"
                enterKeyHint="search"
                placeholder="Search catalogue…"
                className="w-full pl-10 pr-4 py-3 bg-gray-100 border border-transparent focus:bg-white focus:border-indigo-500 rounded-2xl text-base outline-none transition-all"
                value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              />
            </div>
          </div>

          {/* Desktop header */}
          <div className="hidden md:flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="bg-indigo-600 p-2 rounded-xl shadow-indigo-200 shadow-xl transform rotate-3">
                <Package className="text-white w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-black text-gray-900 tracking-tight leading-none">TextileHub</h1>
                <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mt-0.5 inline-block">Pro Manager</span>
              </div>
            </div>

            <div className="flex-1 max-w-md relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 group-focus-within:text-indigo-500 transition-colors" />
              <input
                type="search"
                placeholder="Search catalogue…"
                className="w-full pl-9 pr-4 py-2.5 bg-gray-100 border-transparent focus:bg-white border focus:border-indigo-500 rounded-2xl text-sm outline-none transition-all placeholder:text-gray-400"
                value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden lg:flex items-center gap-2 text-sm text-gray-600 max-w-[140px]">
                <User className="w-4 h-4 shrink-0" />
                <span className="font-medium truncate">{user.name || user.email}</span>
              </div>
              {subscription && !subscription.isFree && (
                <button
                  type="button"
                  onClick={() => setIsPricingOpen(true)}
                  className="hidden sm:flex items-center gap-2 bg-indigo-50 text-indigo-700 border border-indigo-100 px-3 py-2 rounded-2xl text-xs font-bold"
                >
                  <Crown className="w-4 h-4" />
                  <span>
                    {subscription.isTrialActive && trialDaysLeft !== null
                      ? `Trial ${trialDaysLeft}d left`
                      : subscription.isActive
                        ? 'Pro Active'
                        : 'Upgrade'}
                  </span>
                </button>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { window.location.href = '/billing'; }}
                  className="px-3 py-2 rounded-2xl text-xs font-bold border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  Billing
                </button>
                <button
                  type="button"
                  onClick={() => { window.location.href = '/share-stats'; }}
                  className="px-3 py-2 rounded-2xl text-xs font-bold border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  Stats
                </button>
                <button
                  type="button"
                  onClick={() => { window.location.href = '/orders'; }}
                  className="px-3 py-2 rounded-2xl text-xs font-bold border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  Orders
                </button>
                <button
                  type="button"
                  onClick={handleShareCollection}
                  disabled={isSharingCollection}
                  title="Copy one link to your entire catalogue (opens WhatsApp)"
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-2xl text-xs font-bold shadow-lg disabled:opacity-60"
                >
                  <Link2 className="w-4 h-4 shrink-0" />
                  <span className="hidden xl:inline">{isSharingCollection ? '…' : 'Catalogue link'}</span>
                  <span className="xl:hidden">{isSharingCollection ? '…' : 'Link'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(true)}
                  className="flex items-center gap-1.5 bg-gray-900 hover:bg-black text-white px-4 py-2 rounded-2xl text-xs font-bold shadow-lg"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[45] md:hidden" role="dialog" aria-modal="true" aria-labelledby="mobile-menu-title">
          <button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            aria-label="Close menu"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[min(88vh,720px)] flex flex-col rounded-t-3xl bg-white shadow-2xl ring-1 ring-black/5 safe-area-bottom">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-gray-200 shrink-0" aria-hidden />
            <div className="overflow-y-auto overscroll-contain px-4 pb-safe pt-2">
              <h2 id="mobile-menu-title" className="text-lg font-black text-gray-900 mb-1">Account &amp; tools</h2>
              <p className="text-xs text-gray-500 mb-4 truncate" title={user?.email}>
                {user?.name || user?.email || 'Signed in'}
              </p>
              <nav className="flex flex-col gap-2">
                <button
                  type="button"
                  className="touch-target flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 text-left font-bold text-gray-900 active:bg-gray-100"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    window.location.href = '/billing';
                  }}
                >
                  <Crown className="w-5 h-5 text-indigo-600 shrink-0" />
                  Billing &amp; plan
                </button>
                <button
                  type="button"
                  className="touch-target flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 text-left font-bold text-gray-900 active:bg-gray-100"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    window.location.href = '/share-stats';
                  }}
                >
                  <BarChart3 className="w-5 h-5 text-indigo-600 shrink-0" />
                  Link &amp; share statistics
                </button>
                <button
                  type="button"
                  className="touch-target flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 text-left font-bold text-gray-900 active:bg-gray-100"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    window.location.href = '/orders';
                  }}
                >
                  <CheckCircle className="w-5 h-5 text-indigo-600 shrink-0" />
                  Orders
                </button>
                <div className="my-2 border-t border-gray-100" />
                <button
                  type="button"
                  disabled={isSharingCollection}
                  className="touch-target flex w-full flex-col items-start gap-0.5 rounded-2xl bg-indigo-600 px-4 py-3 text-left font-black text-white shadow-lg disabled:opacity-60 active:bg-indigo-700"
                  onClick={async () => {
                    setMobileMenuOpen(false);
                    await handleShareCollection();
                  }}
                >
                  <span className="flex items-center gap-2">
                    <Link2 className="w-5 h-5 shrink-0" />
                    Catalogue link
                  </span>
                  <span className="pl-7 text-xs font-semibold text-indigo-100">
                    One link to your full catalogue (opens WhatsApp)
                  </span>
                </button>
                {subscription && !subscription.isFree && (
                  <button
                    type="button"
                    className="touch-target flex w-full items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 px-4 text-left font-bold text-indigo-800 active:bg-indigo-100"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setIsPricingOpen(true);
                    }}
                  >
                    <Crown className="w-5 h-5 shrink-0" />
                    {subscription.isTrialActive && trialDaysLeft !== null
                      ? `Trial — ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left`
                      : subscription.isActive
                        ? 'Pro active'
                        : 'Upgrade plan'}
                  </button>
                )}
                <button
                  type="button"
                  className="touch-target mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 py-3 font-bold text-gray-700"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                >
                  <LogOut className="w-5 h-5" />
                  Log out
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}

      {subscription && !subscription.isFree && (subscription.needsPayment || subscription.isTrialActive) && (
        <div className="bg-indigo-600 text-white">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-bold">
                {subscription.needsPayment
                  ? 'Your trial is over. Please upgrade to continue.'
                  : `Trial active: ${trialDaysLeft ?? 0} day${trialDaysLeft === 1 ? '' : 's'} left.`}
              </p>
              <p className="text-xs text-indigo-100">Monthly ₹299 or Annual ₹2999</p>
            </div>
            <button
              onClick={() => { window.location.href = '/billing'; }}
              className="bg-white text-indigo-700 px-4 py-2 rounded-xl text-sm font-bold shadow-sm"
            >
              Upgrade Now
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center gap-3 overflow-x-auto no-scrollbar scroll-smooth pb-2">
          <div className="bg-white border-2 border-gray-100 p-2 px-3 rounded-2xl flex items-center gap-2 shadow-sm shrink-0">
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest hidden sm:inline">Filter By</span>
          </div>
          
          <select
            className="bg-white border-2 border-gray-100 px-4 py-2.5 rounded-2xl text-xs font-bold outline-none appearance-none pr-10 relative bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%236b7280%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22m19%209-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1rem_1rem] bg-[right_0.75rem_center] bg-no-repeat shadow-sm touch-manipulation"
            value={filters.catalogue}
            onChange={e => setFilters(f => ({ ...f, catalogue: e.target.value }))}
          >
            <option value="All">All Catalogues</option>
            {catalogues.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>

          <select
            className="bg-white border-2 border-gray-100 px-4 py-2.5 rounded-2xl text-xs font-bold outline-none appearance-none pr-10 relative bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%236b7280%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22m19%209-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1rem_1rem] bg-[right_0.75rem_center] bg-no-repeat shadow-sm touch-manipulation"
            value={filters.fabric}
            onChange={e => setFilters(f => ({ ...f, fabric: e.target.value }))}
          >
            {fabrics.map(fab => (
              <option key={fab} value={fab}>{fab === 'All' ? 'All Fabrics' : fab}</option>
            ))}
          </select>

          <select
            className="bg-white border-2 border-gray-100 px-4 py-2.5 rounded-2xl text-xs font-bold outline-none appearance-none pr-10 relative bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%236b7280%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22m19%209-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] bg-[length:1rem_1rem] bg-[right_0.75rem_center] bg-no-repeat shadow-sm touch-manipulation"
            value={filters.sortBy}
            onChange={e => setFilters(f => ({ ...f, sortBy: e.target.value as any }))}
          >
            <option value="newest">Latest Uploads</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
          </select>
        </div>
        
        {designs.length > 0 && (
          <div className="mt-3 px-1">
            <div className="bg-white border-2 border-gray-100 rounded-2xl p-3 shadow-sm">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">
                Price Range: ₹{filters.minPrice.toLocaleString()} - ₹{filters.maxPrice.toLocaleString()}
              </label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input
                  type="number"
                  min="0"
                  max={filters.maxPrice}
                  value={filters.minPrice}
                  onChange={e => setFilters(f => ({ ...f, minPrice: Math.max(0, Number(e.target.value)) }))}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Min"
                />
                <input
                  type="number"
                  min={filters.minPrice}
                  value={filters.maxPrice}
                  onChange={e => setFilters(f => ({ ...f, maxPrice: Math.max(filters.minPrice, Number(e.target.value)) }))}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Max"
                />
              </div>
              <input
                type="range"
                min="0"
                max={maxPrice}
                value={filters.maxPrice}
                onChange={e => setFilters(f => ({ ...f, maxPrice: Number(e.target.value) }))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 touch-manipulation"
              />
            </div>
          </div>
        )}
      </div>
      


      <main className="max-w-7xl mx-auto px-4 pb-8">
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="text-gray-500">Loading designs...</p>
            </div>
          </div>
        )}

        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 md:gap-6">
            {filteredDesigns.map(design => (
              <DesignCard
                key={design.id}
                design={design}
                isSelected={selectedIds.has(design.id)}
                onSelect={() => toggleSelection(design.id)}
                onDelete={() => handleDeleteDesign(design.id)}
                onEdit={() => handleEditDesign(design)}
                onView={() => setViewingDesign(design)}
                onShareLink={() => {
                  setSelectedDesignForLink(design);
                  setIsShareLinkOpen(true);
                }}
              />
            ))}
          </div>
        )}

        {!loading && filteredDesigns.length === 0 && isReady && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="bg-gray-100 p-8 rounded-[3rem] mb-6 shadow-inner">
              <Package className="w-12 h-12 text-gray-300" />
            </div>
            <h3 className="text-gray-900 font-black text-xl">No designs found</h3>
            <p className="text-gray-400 text-sm max-w-xs mt-2 font-medium">Add a design to begin your professional textile collection.</p>
          </div>
        )}
      </main>

      {selectedIds.size === 0 && (
        <button
          type="button"
          onClick={() => setIsUploadOpen(true)}
          className="fixed z-40 sm:hidden bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] flex h-14 w-14 items-center justify-center rounded-[1.75rem] bg-indigo-600 text-white shadow-2xl ring-4 ring-indigo-100 transition-all hover:bg-indigo-700 active:scale-90"
          aria-label="Add design"
        >
          <Plus className="h-7 w-7" />
        </button>
      )}

      {selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-50 md:inset-x-auto md:left-1/2 md:right-auto md:bottom-8 md:max-w-lg md:-translate-x-1/2 md:px-0 animate-in slide-in-from-bottom duration-300">
          <div className="mx-auto max-w-lg border-t border-white/10 bg-gray-900 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_32px_rgba(0,0,0,0.2)] md:rounded-[2.5rem] md:border md:px-6 md:py-4 md:shadow-2xl md:ring-[12px] md:ring-black/5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-400">Selected</span>
                <span className="truncate font-black text-sm text-white">
                  {selectedIds.size} design{selectedIds.size === 1 ? '' : 's'}
                </span>
                <span className="text-[10px] font-medium text-gray-400">Prepare images &amp; WhatsApp</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="touch-target rounded-xl px-3 text-xs font-bold text-gray-400 transition-colors hover:text-white"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (inStockSelectedDesigns.length === 0) {
                      alert('No in-stock designs selected. Out-of-stock designs cannot be shared.');
                      return;
                    }
                    setIsShareOpen(true);
                  }}
                  className="touch-target flex items-center gap-2 rounded-2xl bg-indigo-500 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-indigo-500/25 transition-all active:scale-95 hover:bg-indigo-600"
                >
                  <MessageCircle className="h-4 w-4 shrink-0" />
                  WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {viewingDesign && (
        <DesignFullscreenModal design={viewingDesign} onClose={() => setViewingDesign(null)} />
      )}

      {isUploadOpen && (
        <UploadForm 
          onClose={() => {
            setIsUploadOpen(false);
            setEditingDesign(null);
          }} 
          onSubmit={editingDesign ? handleUpdateDesign : handleAddDesign}
          initialData={editingDesign}
        />
      )}
      {isShareOpen && (
        <ShareDialog 
          selectedDesigns={inStockSelectedDesigns} 
          userFirmName={user?.firmName} 
          onClose={() => setIsShareOpen(false)}
          onShareLink={(designs) => {
            if (designs.length > 0) {
              setSelectedDesignForLink(designs[0]);
              setIsShareLinkOpen(true);
            }
          }}
        />
      )}
      {isShareLinkOpen && (inStockSelectedDesigns.length > 0 || selectedDesignForLink) && (
        <ShareLinkDialog 
          designs={inStockSelectedDesigns.length > 0 ? inStockSelectedDesigns : undefined}
          design={selectedDesignForLink || undefined}
          onClose={() => {
            setIsShareLinkOpen(false);
            setSelectedDesignForLink(null);
          }} 
        />
      )}
      <PricingDialog
        isOpen={isPricingOpen}
        subscription={subscription || undefined}
        onClose={() => setIsPricingOpen(false)}
        onSubscribed={() => refreshSubscription()}
      />
    </div>
  );
};

export default App;
