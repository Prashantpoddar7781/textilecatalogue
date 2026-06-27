import React, { useState, useEffect } from 'react';
import { X, Link2, Copy, Check, Trash2, Eye, EyeOff, Calendar, Clock, Globe2, ShieldCheck } from 'lucide-react';
import { TextileDesign, ShareLink } from '../types';
import { shareLinksApi } from '../services/api';
import { getShareUrl } from '../services/appUrl';
import { openWhatsAppWithText } from '../services/nativeApp';

interface Props {
  design?: TextileDesign;
  designs?: TextileDesign[];
  onClose: () => void;
}

export const ShareLinkDialog: React.FC<Props> = ({ design, designs, onClose }) => {
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [openCountByLinkId, setOpenCountByLinkId] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [expiresIn, setExpiresIn] = useState<string>('7'); // days
  const [expiresInUnit, setExpiresInUnit] = useState<'days' | 'hours'>('days');
  const [selectedPriceType, setSelectedPriceType] = useState<string>('base');
  const [securityMode, setSecurityMode] = useState<'normal' | 'device_locked'>('normal');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Support both single design and multiple designs
  const designList = designs || (design ? [design] : []);
  const primaryDesign = design || designs?.[0];

  useEffect(() => {
    if (primaryDesign) {
      loadShareLinks();
    }
  }, [primaryDesign?.id]);

  const loadShareLinks = async () => {
    if (!primaryDesign) return;
    try {
      setLoading(true);
      const [listRes, statsRes] = await Promise.all([
        shareLinksApi.getAll(),
        shareLinksApi.getStats().catch(() => null)
      ]);
      const { shareLinks: links } = listRes;
      const designIds = designList.map(d => d.id);
      const designLinks = links.filter(link => {
        if (link.designId && designIds.includes(link.designId)) return true;
        if (link.designs && link.designs.some(d => designIds.includes(d.design.id))) return true;
        return false;
      });
      setShareLinks(designLinks);
      const openMap: Record<string, number> = {};
      if (statsRes?.linksWithOpens) {
        statsRes.linksWithOpens.forEach(l => { openMap[l.id] = l.openCount; });
      }
      setOpenCountByLinkId(openMap);
    } catch (error) {
      console.error('Failed to load share links:', error);
      alert('Failed to load share links');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLink = async () => {
    if (designList.length === 0) return;
    
    try {
      setCreating(true);
      const expiresAt = calculateExpirationDate();

      // Create a single link for all selected designs
      const shareLink = await shareLinksApi.create({
        designIds: designList.map(d => d.id),
        expiresAt: expiresAt || undefined,
        selectedPriceType: selectedPriceType === 'base' ? undefined : selectedPriceType,
        securityMode
      });

      if (shareLink) {
        setShareLinks(prev => [shareLink, ...prev]);
        setExpiresIn('7');
        setExpiresInUnit('days');
        setSelectedPriceType('base');
        setSecurityMode('normal');

        // Auto-copy and open WhatsApp with the link
        const shareUrl = getShareUrl(shareLink.token);
        try {
          await navigator.clipboard.writeText(shareUrl);
        } catch (e) {
          console.warn('Clipboard write failed:', e);
        }
        await openWhatsAppWithText(shareUrl);
      } else {
        alert('Failed to create share link. Please try again.');
      }
    } catch (error: any) {
      console.error('Failed to create share link:', error);
      alert('Failed to create share link: ' + (error.message || 'Unknown error'));
    } finally {
      setCreating(false);
    }
  };

  const calculateExpirationDate = (): string | null => {
    if (!expiresIn || Number(expiresIn) <= 0) return null;
    
    const now = new Date();
    if (expiresInUnit === 'days') {
      now.setDate(now.getDate() + Number(expiresIn));
    } else {
      now.setHours(now.getHours() + Number(expiresIn));
    }
    return now.toISOString();
  };

  const handleToggleLink = async (link: ShareLink) => {
    try {
      if (link.isActive) {
        await shareLinksApi.disable(link.id);
      } else {
        await shareLinksApi.enable(link.id);
      }
      await loadShareLinks();
    } catch (error: any) {
      alert('Failed to update link: ' + (error.message || 'Unknown error'));
    }
  };

  const handleDeleteLink = async (link: ShareLink) => {
    if (!confirm('Are you sure you want to delete this share link?')) return;
    
    try {
      await shareLinksApi.delete(link.id);
      await loadShareLinks();
    } catch (error: any) {
      alert('Failed to delete link: ' + (error.message || 'Unknown error'));
    }
  };

  const copyToClipboard = (token: string) => {
    const shareUrl = getShareUrl(token);
    navigator.clipboard.writeText(shareUrl);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const formatExpirationDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const isLinkExpired = (link: ShareLink) => {
    if (!link.expiresAt) return false;
    return new Date() > new Date(link.expiresAt);
  };

  const getPriceOptions = () => {
    const options = [{ value: 'base', label: 'Base Price' }];
    if (primaryDesign?.additionalPrices) {
      primaryDesign.additionalPrices.forEach(ap => {
        options.push({ value: ap.name, label: ap.name });
      });
    }
    return options;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-2 rounded-xl">
              <Link2 className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Shareable Links</h2>
              <p className="text-sm text-gray-500">
                {designList.length === 1 
                  ? (primaryDesign?.name || 'Design')
                  : `${designList.length} Designs Selected`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Create New Link Section */}
          <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 space-y-4">
            <h3 className="font-semibold text-gray-900">Create New Share Link</h3>
            
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Price Type to Display</label>
                <select
                  className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={selectedPriceType}
                  onChange={e => setSelectedPriceType(e.target.value)}
                >
                  {getPriceOptions().map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Expires In</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={expiresIn}
                    onChange={e => setExpiresIn(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Unit</label>
                  <select
                    className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={expiresInUnit}
                    onChange={e => setExpiresInUnit(e.target.value as 'days' | 'hours')}
                  >
                    <option value="days">Days</option>
                    <option value="hours">Hours</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Link Security</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSecurityMode('normal')}
                    className={`rounded-2xl border-2 bg-white p-4 text-left transition-all ${
                      securityMode === 'normal'
                        ? 'border-indigo-500 ring-4 ring-indigo-100'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="rounded-xl bg-gray-100 p-2">
                        <Globe2 className="h-5 w-5 text-gray-700" />
                      </div>
                      <div>
                        <p className="font-black text-gray-900">Normal link</p>
                        <p className="text-[11px] font-semibold text-gray-500">Anyone with link can open</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-gray-600">
                      Best for general catalogues where forwarding is okay.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSecurityMode('device_locked')}
                    className={`rounded-2xl border-2 bg-white p-4 text-left transition-all ${
                      securityMode === 'device_locked'
                        ? 'border-emerald-500 ring-4 ring-emerald-100'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="rounded-xl bg-emerald-50 p-2">
                        <ShieldCheck className="h-5 w-5 text-emerald-700" />
                      </div>
                      <div>
                        <p className="font-black text-gray-900">Secured link</p>
                        <p className="text-[11px] font-semibold text-emerald-700">Locks to first device</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-gray-600">
                      If forwarded, it will not open on another phone/browser.
                    </p>
                  </button>
                </div>
              </div>

              <button
                onClick={handleCreateLink}
                disabled={creating || designList.length === 0}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating {designList.length > 1 ? `${designList.length} Links` : 'Link'}...
                  </>
                ) : (
                  <>
                    <Link2 className="w-4 h-4" />
                    Create Share Link{designList.length > 1 ? `s (${designList.length})` : ''}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Existing Links */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">Existing Share Links</h3>
            
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : shareLinks.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Link2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No share links created yet</p>
              </div>
            ) : (
              shareLinks.map(link => {
                const isExpired = isLinkExpired(link);
                const shareUrl = getShareUrl(link.token);
                
                return (
                  <div
                    key={link.id}
                    className={`p-4 rounded-xl border-2 ${
                      link.isActive && !isExpired
                        ? 'border-gray-200 bg-white'
                        : 'border-gray-100 bg-gray-50 opacity-75'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold text-sm text-gray-900">
                            {link.selectedPriceType || 'Base Price'}
                          </span>
                          {!link.isActive && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded">
                              Disabled
                            </span>
                          )}
                          {isExpired && (
                            <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded">
                              Expired
                            </span>
                          )}
                          {link.securityMode === 'device_locked' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded">
                              <ShieldCheck className="w-3 h-3" />
                              Secured
                            </span>
                          )}
                        </div>
                        <div className="space-y-1 text-xs text-gray-600">
                          {(openCountByLinkId[link.id] ?? 0) > 0 && (
                            <div className="flex items-center gap-2 text-indigo-600 font-semibold">
                              <Eye className="w-3.5 h-3.5" />
                              <span>{openCountByLinkId[link.id]} open{openCountByLinkId[link.id] === 1 ? '' : 's'}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Expires: {formatExpirationDate(link.expiresAt)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Created: {formatExpirationDate(link.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <input
                        type="text"
                        readOnly
                        value={shareUrl}
                        className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono"
                      />
                      <button
                        onClick={() => copyToClipboard(link.token)}
                        className="p-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition-colors"
                        title="Copy link"
                      >
                        {copiedToken === link.token ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleLink(link)}
                        className={`flex-1 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                          link.isActive
                            ? 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                            : 'bg-green-100 hover:bg-green-200 text-green-700'
                        }`}
                      >
                        {link.isActive ? (
                          <>
                            <EyeOff className="w-4 h-4 inline mr-2" />
                            Disable
                          </>
                        ) : (
                          <>
                            <Eye className="w-4 h-4 inline mr-2" />
                            Enable
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteLink(link)}
                        className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-medium text-sm transition-colors flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
