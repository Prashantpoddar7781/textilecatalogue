import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Share2, Package, CheckCircle, SlidersHorizontal, LogOut, User } from 'lucide-react';
import { TextileDesign, CatalogueFilters } from './types';
import { UploadForm } from './components/UploadForm';
import { DesignCard } from './components/DesignCard';
import { ShareDialog } from './components/ShareDialog';
import { LoginDialog } from './components/LoginDialog';
import { GroupDialog } from './components/GroupDialog';
import { designsApi, authApi } from './services/api';

const App: React.FC = () => {
  const [designs, setDesigns] = useState<TextileDesign[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
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
        wholesalePrice: d.wholesalePrice,
        retailPrice: d.retailPrice,
        fabric: d.fabric,
        description: d.description || '',
        firmName: d.user?.firmName,
        createdAt: new Date(d.createdAt).getTime()
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
        wholesalePrice: design.wholesalePrice,
        retailPrice: design.retailPrice,
        fabric: design.fabric,
        description: design.description,
        catalogueId: design.catalogueId
      });
      
      setDesigns(prev => [{
        id: created.id,
        name: created.name || 'Untitled Design',
        catalogueId: created.catalogueId,
        catalogueName: created.catalogue?.name,
        image: created.image,
        wholesalePrice: created.wholesalePrice,
        retailPrice: created.retailPrice,
        fabric: created.fabric,
        description: created.description || '',
        firmName: created.user?.firmName,
        createdAt: new Date(created.createdAt).getTime()
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
        wholesalePrice: design.wholesalePrice,
        retailPrice: design.retailPrice,
        fabric: design.fabric,
        description: design.description,
        catalogueId: design.catalogueId
      });
      
      setDesigns(prev => prev.map(d => 
        d.id === editingDesign.id ? {
          id: updated.id,
          name: updated.name || 'Untitled Design',
          catalogueId: updated.catalogueId,
          catalogueName: updated.catalogue?.name,
          image: updated.image,
          wholesalePrice: updated.wholesalePrice,
          retailPrice: updated.retailPrice,
          fabric: updated.fabric,
          description: updated.description || '',
          firmName: updated.user?.firmName,
          createdAt: new Date(updated.createdAt).getTime()
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
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    setUser(null);
    setDesigns([]);
    setIsLoginOpen(true);
  };

  const selectedDesigns = designs.filter(d => selectedIds.has(d.id));

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

  return (
    <div className="min-h-screen bg-[#FDFDFF] pb-36">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b px-4 py-3 md:px-8 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
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
              type="text"
              placeholder="Search catalogue..."
              className="w-full pl-9 pr-4 py-2.5 bg-gray-100 border-transparent focus:bg-white border focus:border-indigo-500 rounded-2xl text-sm outline-none transition-all placeholder:text-gray-400"
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
              <User className="w-4 h-4" />
              <span className="font-medium">{user.name || user.email}</span>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={() => setIsGroupDialogOpen(true)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-2xl font-bold transition-all shadow-lg active:scale-95"
              >
                <Package className="w-4 h-4" />
                <span>Groups</span>
              </button>
              <button
                onClick={() => setIsUploadOpen(true)}
                className="flex items-center gap-2 bg-gray-900 hover:bg-black text-white px-5 py-2.5 rounded-2xl font-bold transition-all shadow-lg active:scale-95"
              >
                <Plus className="w-5 h-5" />
                <span>Add Design</span>
              </button>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              title="Logout"
            >
              <LogOut className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
      </header>

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

      <button
        onClick={() => setIsUploadOpen(true)}
        className="fixed bottom-8 right-6 sm:hidden z-40 bg-indigo-600 text-white p-5 rounded-[2rem] shadow-2xl active:scale-90 transition-all hover:bg-indigo-700 ring-4 ring-indigo-100"
      >
        <Plus className="w-6 h-6" />
      </button>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-8 inset-x-4 z-40 animate-in slide-in-from-bottom duration-500 max-w-lg mx-auto">
          <div className="bg-gray-900 text-white px-6 py-4 rounded-[2.5rem] shadow-2xl flex items-center justify-between border border-white/10 ring-[12px] ring-black/5">
            <div className="flex flex-col">
              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest leading-none mb-1">Selections</span>
              <span className="font-black text-sm">{selectedIds.size} Designs ready</span>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setSelectedIds(new Set())}
                className="text-xs font-bold text-gray-400 hover:text-white px-3 py-2 transition-colors"
              >
                Clear
              </button>
              <button
                onClick={() => setIsShareOpen(true)}
                className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 px-6 py-3.5 rounded-2xl font-black text-sm transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
            </div>
          </div>
        </div>
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
      {isShareOpen && <ShareDialog selectedDesigns={selectedDesigns} userFirmName={user?.firmName} onClose={() => setIsShareOpen(false)} />}
      {isGroupDialogOpen && <GroupDialog onClose={() => setIsGroupDialogOpen(false)} mode="manage" />}
    </div>
  );
};

export default App;
