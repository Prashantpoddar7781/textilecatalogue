
import React, { useState, useEffect, useRef } from 'react';
import { X, MessageCircle, CheckSquare, Square, Loader2, Download, Eye, AlertCircle, Send, Users } from 'lucide-react';
import { TextileDesign, ShareOptions, Group } from '../types';
import { groupsApi } from '../services/api';
import { GroupDialog } from './GroupDialog';

interface Props {
  selectedDesigns: TextileDesign[];
  userFirmName?: string;
  onClose: () => void;
}

export const ShareDialog: React.FC<Props> = ({ selectedDesigns, userFirmName, onClose }) => {
  const [processing, setProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isMobile] = useState(() => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  const [readyToLink, setReadyToLink] = useState(false);
  const [shareMode, setShareMode] = useState<'whatsapp' | 'group'>('whatsapp');
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [options, setOptions] = useState<ShareOptions>({
    includeWholesale: false,
    includeRetail: true,
    includeFabric: true,
    includeDescription: false,
    includeFirmName: false
  });

  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (shareMode === 'group') {
      loadGroups();
    }
  }, [shareMode]);

  const loadGroups = async () => {
    try {
      const groupsData = await groupsApi.getAll();
      setGroups(groupsData.map(g => ({
        ...g,
        createdAt: new Date(g.createdAt).getTime(),
        updatedAt: new Date(g.updatedAt).getTime()
      })));
    } catch (error) {
      console.error('Failed to load groups:', error);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const updatePreview = async () => {
      if (selectedDesigns.length > 0) {
        try {
          const blob = await generateBrandedImage(selectedDesigns[0]);
          if (!isMounted) return;

          const newUrl = URL.createObjectURL(blob);
          
          if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
          }
          
          previewUrlRef.current = newUrl;
          setPreviewUrl(newUrl);
        } catch (err) {
          console.error("Preview generation failed", err);
        }
      }
    };

    updatePreview();

    return () => {
      isMounted = false;
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, [options, selectedDesigns]);

  const generateBrandedImage = async (design: TextileDesign): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('Canvas context not found');

        // Set dimensions - maintain aspect ratio but ensure minimum quality
        const imageMaxWidth = 1200;
        const maxHeight = 1600;
        let width = img.naturalWidth || 800;
        let height = img.naturalHeight || 1000;
        
        // Scale down if too large to prevent memory issues on mobile
        if (width > imageMaxWidth || height > maxHeight) {
          const scale = Math.min(imageMaxWidth / width, maxHeight / height);
          width = width * scale;
          height = height * scale;
        }
        
        canvas.width = width;
        canvas.height = height;

        // Draw background image with high quality
        ctx.drawImage(img, 0, 0, width, height);

        // Calculate banner height based on content
        const bannerHeight = Math.max(Math.floor(height * 0.18), 120);
        const padding = Math.floor(width * 0.04);
        const fontSize = Math.max(20, Math.floor(height * 0.035));
        const lineHeight = fontSize * 1.4;
        
        // 1. Semi-transparent overlay for better text readability
        const gradient = ctx.createLinearGradient(0, height - bannerHeight, 0, height);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, height - bannerHeight, width, bannerHeight);

        // 2. Prepare content lines
        const lines: string[] = [];
        
        // Firm name at the top if included
        if (options.includeFirmName && userFirmName) {
          lines.push(`Firm: ${userFirmName}`);
        }
        
        if (options.includeFabric && design.fabric) {
          lines.push(`Fabric: ${design.fabric}`);
        }
        if (options.includeRetail) {
          lines.push(`Retail: ₹${design.retailPrice.toLocaleString()}`);
        }
        if (options.includeWholesale) {
          lines.push(`Wholesale: ₹${design.wholesalePrice.toLocaleString()}`);
        }
        if (options.includeDescription && design.description) {
          // Truncate description if too long
          const maxDescLength = 60;
          const desc = design.description.length > maxDescLength 
            ? design.description.substring(0, maxDescLength) + '...'
            : design.description;
          lines.push(desc);
        }

        // 3. Render text with better formatting and word wrapping
        ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        
        const textMaxWidth = width - (padding * 2);
        let yPos = height - bannerHeight + padding;
        
        lines.forEach((line) => {
          // Word wrap for long lines
          const words = line.split(' ');
          let currentLine = '';
          
          words.forEach((word) => {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > textMaxWidth && currentLine) {
              // Draw current line and start new one
              ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
              ctx.shadowBlur = 4;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 2;
              ctx.fillText(currentLine, padding, yPos);
              ctx.shadowColor = 'transparent';
              ctx.shadowBlur = 0;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = 0;
              
              yPos += lineHeight;
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          });
          
          // Draw remaining text
          if (currentLine) {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 4;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 2;
            ctx.fillText(currentLine, padding, yPos);
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            yPos += lineHeight;
          }
        });

        // 4. Brand badge (Top Right) - only if space allows
        if (width > 400) {
          const tagW = Math.min(Math.floor(width * 0.3), 200);
          const tagH = Math.floor(height * 0.06);
          const tagX = width - tagW - 20;
          const tagY = 20;
          
          ctx.fillStyle = '#4f46e5';
          ctx.fillRect(tagX, tagY, tagW, tagH);
          
          ctx.fillStyle = 'white';
          ctx.font = `900 ${Math.floor(fontSize * 0.7)}px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('TEXTILE HUB', tagX + (tagW / 2), tagY + (tagH / 2));
        }

        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject('Blob conversion failed');
        }, 'image/jpeg', 0.92);
      };

      img.onerror = () => reject('Image source failed to load');
      img.src = design.image;
    });
  };

  const downloadOne = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke after a delay to ensure the browser handled the download
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handlePrepareShare = async () => {
    setProcessing(true);
    try {
      const files: File[] = [];
      const blobs: Blob[] = [];
      
      // Generate all images
      for (let i = 0; i < selectedDesigns.length; i++) {
        const blob = await generateBrandedImage(selectedDesigns[i]);
        blobs.push(blob);
        files.push(new File([blob], `TextileHub_Design_${i + 1}.jpg`, { type: 'image/jpeg' }));
      }

      const itemText = selectedDesigns.length === 1 ? 'design' : 'designs';
      const caption = `📦 TextileHub Catalogue\n\n${selectedDesigns.length} ${itemText} attached. Check the images for details! 🎨`;

      // Priority 1: Mobile Native Sharing API (best for WhatsApp on mobile)
      if (isMobile && navigator.share) {
        try {
          // Check if files can be shared
          if (navigator.canShare && navigator.canShare({ files })) {
            await navigator.share({
              files: files,
              title: 'TextileHub Design Catalogue',
              text: caption,
            });
            onClose();
            return;
          } else {
            // Fallback: share without files (some browsers don't support file sharing)
            // User can attach manually
            const textWithInfo = `${caption}\n\n${selectedDesigns.map((d, i) => 
              `${i + 1}. ${d.fabric} - ₹${d.retailPrice.toLocaleString()}`
            ).join('\n')}`;
            
            if (navigator.canShare({ text: textWithInfo })) {
              await navigator.share({
                text: textWithInfo,
                title: 'TextileHub Catalogue',
              });
              // Still download images for manual attachment
              for (let i = 0; i < blobs.length; i++) {
                downloadOne(blobs[i], `TextileHub_Design_${i + 1}.jpg`);
                if (blobs.length > 1) await new Promise(r => setTimeout(r, 300));
              }
              onClose();
              return;
            }
          }
        } catch (e: any) {
          // User cancelled or error - continue to fallback
          if (e.name !== 'AbortError') {
            console.log("Share API error:", e);
          }
        }
      }

      // Priority 2: WhatsApp Web API (works on desktop and mobile browsers)
      // First download images, then open WhatsApp
      for (let i = 0; i < blobs.length; i++) {
        downloadOne(blobs[i], `TextileHub_Design_${i + 1}.jpg`);
        if (blobs.length > 1) await new Promise(r => setTimeout(r, 300));
      }

      // Set ready state to show WhatsApp button
      setReadyToLink(true);

    } catch (error) {
      console.error('Share process failed:', error);
      alert('Could not prepare images. Please ensure your images are valid.');
    } finally {
      setProcessing(false);
    }
  };

  const openWhatsAppLink = () => {
    const itemText = selectedDesigns.length === 1 ? 'design' : 'designs';
    const caption = `📦 TextileHub Catalogue\n\n${selectedDesigns.length} ${itemText} attached. Check the images for details! 🎨`;
    
    // Use WhatsApp API - works on both mobile and desktop
    const waUrl = `https://wa.me/?text=${encodeURIComponent(caption)}`;
    
    // Try to open in new tab/window
    const newWindow = window.open(waUrl, '_blank');
    
    // If popup blocked, try direct navigation (mobile)
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      window.location.href = waUrl;
    }
    
    // Close dialog after a short delay
    setTimeout(() => {
      onClose();
    }, 500);
  };

  const shareToGroup = async () => {
    if (!selectedGroup || selectedGroup.members.length === 0) {
      alert('Please select a group with members');
      return;
    }

    setProcessing(true);
    try {
      // Generate all images first
      const blobs: Blob[] = [];
      const files: File[] = [];
      
      for (let i = 0; i < selectedDesigns.length; i++) {
        const blob = await generateBrandedImage(selectedDesigns[i]);
        blobs.push(blob);
        files.push(new File([blob], `TextileHub_Design_${i + 1}.jpg`, { type: 'image/jpeg' }));
      }

      // Create message
      const itemText = selectedDesigns.length === 1 ? 'design' : 'designs';
      const caption = `📦 TextileHub Catalogue\n\n${selectedDesigns.length} ${itemText} attached. Check the images for details! 🎨`;

      // Check if we can use native share API (mobile)
      const canShareFiles = isMobile && navigator.share && navigator.canShare && navigator.canShare({ files });

      if (canShareFiles) {
        // Mobile: Open WhatsApp for each member, images available via native share
        // First, trigger native share to make images available in share sheet
        try {
          await navigator.share({
            files: files,
            title: 'TextileHub Design Catalogue',
            text: caption
          });
          // If user shares successfully, close dialog
          onClose();
          setProcessing(false);
          return;
        } catch (shareError: any) {
          // User cancelled or wants to share to specific contacts
          if (shareError.name === 'AbortError') {
            // User cancelled - open WhatsApp for each member instead
            for (let i = 0; i < selectedGroup.members.length; i++) {
              const member = selectedGroup.members[i];
              const phoneNumber = member.phoneNumber.replace(/\D/g, '');
              
              if (phoneNumber) {
                const waUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(caption)}`;
                setTimeout(() => {
                  window.open(waUrl, '_blank');
                }, i * 1500);
              }
            }
            alert(`Opening WhatsApp for ${selectedGroup.members.length} members.\n\nUse the share button in each chat to attach images from your gallery.`);
          }
        }
      } else {
        // Desktop: Download images first, then open WhatsApp for each member
        // Download all images
        for (let i = 0; i < blobs.length; i++) {
          downloadOne(blobs[i], `TextileHub_Design_${i + 1}.jpg`);
          if (blobs.length > 1) await new Promise(r => setTimeout(r, 300));
        }

        // Wait a bit for downloads to complete
        await new Promise(r => setTimeout(r, 1000));

        // Open WhatsApp for each member individually
        for (let i = 0; i < selectedGroup.members.length; i++) {
          const member = selectedGroup.members[i];
          const phoneNumber = member.phoneNumber.replace(/\D/g, '');
          
          if (phoneNumber) {
            const waUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(caption)}`;
            
            // Open each WhatsApp chat with increasing delay
            setTimeout(() => {
              window.open(waUrl, '_blank');
            }, i * 2000); // 2 second delay between each to avoid popup blocking
          }
        }

        // Show instruction alert
        alert(`Images downloaded! Opening WhatsApp for ${selectedGroup.members.length} members.\n\nPlease attach the downloaded images to each chat manually.`);
      }

      // Close dialog after a delay
      setTimeout(() => {
        onClose();
      }, selectedGroup.members.length * 2000 + 1000);
    } catch (error) {
      console.error('Failed to share to group:', error);
      alert('Failed to share to group. Please try again.');
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/95 backdrop-blur-md p-0 sm:p-4 safe-area-top safe-area-bottom">
      <div className="bg-white w-full max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-300 max-h-[95vh] touch-manipulation">
        
        <div className="px-6 py-5 flex items-center justify-between border-b bg-white">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-2 rounded-xl">
              <MessageCircle className="w-6 h-6 text-green-600 fill-green-600/10" />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 tracking-tight">WhatsApp Catalogue</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-full">
                  Step {readyToLink ? '2: Send' : '1: Options'}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Live Preview Area */}
          <div className="relative aspect-[4/3] bg-gray-900 rounded-[2rem] overflow-hidden shadow-2xl ring-4 ring-white">
            {previewUrl ? (
              <img src={previewUrl} className="w-full h-full object-contain" alt="Preview" key={previewUrl} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-white/30 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <span className="text-[10px] font-black uppercase tracking-widest">Rendering Preview...</span>
              </div>
            )}
            <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white text-[9px] font-black px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-white/10">
              <Eye className="w-3.5 h-3.5 text-indigo-400" />
              IMAGE LABEL PREVIEW
            </div>
          </div>

          {!readyToLink ? (
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'includeRetail', label: 'Retail Price', key: 'includeRetail' },
                { id: 'includeFabric', label: 'Fabric Info', key: 'includeFabric' },
                { id: 'includeWholesale', label: 'Wholesale', key: 'includeWholesale' },
                { id: 'includeDescription', label: 'Description', key: 'includeDescription' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  disabled={processing}
                  onClick={() => setOptions({ ...options, [opt.key]: !options[opt.key as keyof ShareOptions] })}
                  className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left ${
                    options[opt.key as keyof ShareOptions] 
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 shadow-sm' 
                      : 'border-gray-50 bg-gray-50 text-gray-400'
                  }`}
                >
                  {options[opt.key as keyof ShareOptions] ? 
                    <CheckSquare className="w-5 h-5 text-indigo-600" /> : 
                    <Square className="w-5 h-5" />
                  }
                  <span className="font-bold text-xs uppercase tracking-tight">{opt.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="bg-green-50 p-6 rounded-[2rem] border border-green-100 space-y-4 animate-in fade-in zoom-in duration-300">
              <div className="flex items-center gap-3 text-green-700">
                <CheckSquare className="w-6 h-6" />
                <p className="text-sm font-black uppercase tracking-tight">Images Ready!</p>
              </div>
              <p className="text-xs text-green-800 font-medium leading-relaxed">
                {isMobile 
                  ? "Images have been saved. Now click the button below to open WhatsApp and select your contact."
                  : "We've downloaded your images with prices. WhatsApp Web is next — please ATTACH the downloaded images to your message."}
              </p>
            </div>
          )}

          {!isMobile && !readyToLink && (
            <div className="bg-amber-50 p-4 rounded-2xl flex items-start gap-3 border border-amber-100">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-[10px] font-black text-amber-900 uppercase">PC Browser Note</p>
                <p className="text-[10px] text-amber-800 leading-relaxed font-bold">
                  We will download the edited images first, then open WhatsApp. Just attach the images manually.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="p-8 bg-gray-50 border-t space-y-4">
          {/* Share Mode Selection */}
          {!readyToLink && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setShareMode('whatsapp');
                  setSelectedGroup(null);
                }}
                className={`p-4 rounded-2xl border-2 transition-all ${
                  shareMode === 'whatsapp'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                    : 'border-gray-200 bg-white text-gray-600'
                }`}
              >
                <MessageCircle className="w-6 h-6 mx-auto mb-2" />
                <span className="text-xs font-bold uppercase">WhatsApp</span>
              </button>
              <button
                onClick={() => {
                  setShareMode('group');
                  loadGroups();
                }}
                className={`p-4 rounded-2xl border-2 transition-all ${
                  shareMode === 'group'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                    : 'border-gray-200 bg-white text-gray-600'
                }`}
              >
                <Users className="w-6 h-6 mx-auto mb-2" />
                <span className="text-xs font-bold uppercase">Group</span>
              </button>
            </div>
          )}

          {/* Group Selection */}
          {shareMode === 'group' && !readyToLink && (
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-gray-700">Select Group</label>
              {groups.length === 0 ? (
                <div className="p-4 bg-gray-50 rounded-xl text-center">
                  <p className="text-sm text-gray-500 mb-3">No groups found</p>
                  <button
                    onClick={() => setShowGroupDialog(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium"
                  >
                    Create Group
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {groups.map(group => (
                    <button
                      key={group.id}
                      onClick={() => setSelectedGroup(group)}
                      className={`w-full p-3 rounded-xl border-2 text-left transition-all ${
                        selectedGroup?.id === group.id
                          ? 'border-indigo-600 bg-indigo-50'
                          : 'border-gray-200 bg-white hover:border-indigo-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-bold text-sm text-gray-900">{group.name}</h4>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
                          </p>
                        </div>
                        {selectedGroup?.id === group.id && (
                          <CheckSquare className="w-5 h-5 text-indigo-600" />
                        )}
                      </div>
                    </button>
                  ))}
                  <button
                    onClick={() => setShowGroupDialog(true)}
                    className="w-full p-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition-all text-sm font-medium"
                  >
                    + Create New Group
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          {!readyToLink ? (
            <button
              disabled={processing || (shareMode === 'group' && !selectedGroup)}
              onClick={shareMode === 'group' ? shareToGroup : handlePrepareShare}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-5 rounded-[1.8rem] font-black shadow-2xl shadow-indigo-200 flex items-center justify-center gap-3 active:scale-[0.97] transition-all disabled:opacity-50 text-lg"
            >
              {processing ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : shareMode === 'group' ? (
                <Users className="w-6 h-6" />
              ) : (
                <Download className="w-6 h-6" />
              )}
              <span>
                {processing 
                  ? 'Processing...' 
                  : shareMode === 'group' 
                    ? `Share to ${selectedGroup?.name || 'Group'}` 
                    : 'Prepare Images'}
              </span>
            </button>
          ) : (
            <button
              onClick={openWhatsAppLink}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-5 rounded-[1.8rem] font-black shadow-2xl shadow-green-200 flex items-center justify-center gap-3 active:scale-[0.97] transition-all text-lg"
            >
              <MessageCircle className="w-7 h-7 fill-white/20" />
              <span>Go to WhatsApp</span>
              <Send className="w-4 h-4 opacity-50" />
            </button>
          )}
          
          <div className="flex items-center justify-center gap-4 mt-6">
             <div className="h-px bg-gray-200 flex-1"></div>
             <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest shrink-0">
               {selectedDesigns.length} Items Selected
             </p>
             <div className="h-px bg-gray-200 flex-1"></div>
          </div>
        </div>
      </div>

      {showGroupDialog && (
        <GroupDialog
          onClose={() => {
            setShowGroupDialog(false);
            loadGroups();
          }}
          mode="manage"
        />
      )}
    </div>
  );
};
