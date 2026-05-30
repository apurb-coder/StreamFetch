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
      
      // Map down only downloadable audio and video formats
      formats: Array.isArray(rawData.formats)
        ? rawData.formats
            .map(format => ({
              formatId: format.format_id,
              ext: format.ext,
              resolution: format.resolution || `${format.width}x${format.height}`,
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
              hasVideo: format.vcodec && format.vcodec !== 'none',
              hasAudio: format.acodec && format.acodec !== 'none'
            }))
            .filter(f => f.url || f.manifestUrl) // Exclude entries missing stream links
        : []
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

module.exports = ResponseOptimizer;
