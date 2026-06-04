/**
 * Response Optimizer and Formatter
 * 
 * Filters and sanitizes the massive metadata output produced by `yt-dlp` dumps.
 * Reduces raw, uncompressed 1MB+ JSON streams down to lean <5KB response models
 * by removing complex internal diagnostics, duplicate fields, and metadata trash.
 */

class ResponseOptimizer {
  /**
   * Refactors raw yt-dlp dump results into an optimized JSON schema
   * @param {Object} rawData - Full unparsed yt-dlp JSON result
   * @returns {Object} Optimized, highly structured API response model
   */
  static clean(rawData) {
    if (!rawData) return null;

    const rawFormats = Array.isArray(rawData.formats) ? rawData.formats : [];
    
    // Map down only downloadable audio and video formats
    const mappedFormats = rawFormats
      .map(format => {
        const hasVideo = !!(format.vcodec && format.vcodec !== 'none');
        const hasAudio = !!(
          (format.acodec && format.acodec !== 'none') ||
          format.resolution === 'audio only' ||
          (format.vcodec === 'none' && format.ext !== 'mhtml' && (!format.protocol || !format.protocol.includes('mhtml')))
        );
        
        let ext = format.ext || '';
        // Map audio-only formats to mp3 as requested
        if (hasAudio && !hasVideo) {
          ext = 'mp3';
        }

        return {
          formatId: format.format_id,
          ext: ext,
          resolution: format.resolution || `${format.width}x${format.height}`,
          width: format.width || null,
          height: format.height || null,
          filesize: format.filesize || null,
          filesizeApprox: format.filesize_approx || null,
          vcodec: format.vcodec || 'none',
          acodec: format.acodec || 'none',
          url: format.url || null,
          manifestUrl: format.manifest_url || null,
          protocol: format.protocol || '',
          totalBitrate: format.tbr || null,     // Combined bitrate
          videoBitrate: format.vbr || null,     // Video track bitrate
          audioBitrate: format.abr || null,     // Audio track bitrate
          hasVideo,
          hasAudio
        };
      })
      .filter(f => {
        if (!f.url && !f.manifestUrl) return false;
        
        // Include audio-only formats (mapped to mp3)
        if (f.hasAudio && !f.hasVideo) return true;
        
        // Include video-only/silent formats
        if (f.hasVideo && !f.hasAudio) return true;
        
        // Include video formats with audio
        return f.hasVideo && f.hasAudio;
      });

    // Extract best audio format for root level compatibility
    const audioFormats = mappedFormats.filter(f => f.hasAudio && !f.hasVideo);
    const sortedAudioFormats = [...audioFormats].sort((a, b) => {
      const bitrateA = a.audioBitrate || a.totalBitrate || 0;
      const bitrateB = b.audioBitrate || b.totalBitrate || 0;
      return bitrateB - bitrateA;
    });
    const bestAudio = sortedAudioFormats[0] || null;

    return {
      id: rawData.id,
      title: rawData.title,
      duration: rawData.duration, // in seconds
      thumbnail: rawData.thumbnail,
      description: rawData.description ? rawData.description.substring(0, 200) + '...' : '',
      uploader: rawData.uploader,
      uploadDate: rawData.upload_date,
      viewCount: rawData.view_count,
      likeCount: rawData.like_count || 0,
      
      // Root level properties for compatibility with frontend/audio tab
      audioUrl: bestAudio ? (bestAudio.url || bestAudio.manifestUrl) : null,
      audioBitrate: bestAudio ? (bestAudio.audioBitrate || bestAudio.totalBitrate) : null,
      ext: bestAudio ? bestAudio.ext : null,
      filesize: bestAudio ? (bestAudio.filesize || bestAudio.filesizeApprox) : null,
      
      formats: mappedFormats
    };
  }

  /**
   * Minimizes formats representation to the bare minimum needed for stream queries
   * @param {Object} optimizedData - Previously cleaned metadata object
   * @returns {Array} Bare format specifications
   */
  static stripToFormatsOnly(optimizedData) {
    if (!optimizedData || !Array.isArray(optimizedData.formats)) return [];

    return optimizedData.formats.map(f => ({
      id: f.formatId,
      quality: f.resolution,
      extension: f.ext,
      size: f.filesize || f.filesizeApprox,
      hasVideo: f.hasVideo,
      hasAudio: f.hasAudio
    }));
  }
}

export default ResponseOptimizer;
