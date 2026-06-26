/**
 * App Services - Main Loader/Index File
 * 
 * This file serves as the main entry point for all service modules.
 * All service modules are loaded via script tags before this file,
 * and they expose themselves to the global window object.
 * 
 * This file ensures all services are available and adds any helper functions.
 * 
 * Refactored from a single 5000+ line file into modular services:
 * - services/data-manager.js - Data management and sync queue
 * - services/periodic-inspection-store.js - Periodic inspection management
 * - services/approval-circuits.js - Approval circuit management
 * - services/audit-log.js - Audit logging
 * - services/user-activity-log.js - User activity logging
 * - services/cloud-storage-integration.js - Cloud storage (OneDrive, Google Drive, SharePoint)
 * - services/workflow.js - Workflow engine
 * - services/backend-client.js - الخادم السحابي and Sheets integration
 */

// All services are already loaded via script tags and exposed to window
// This file ensures they're all available and adds helper functions

// Verify all services are loaded (for debugging)
if (typeof window !== 'undefined') {
    // Services should already be on window from their respective modules
    // Just verify they exist and add helper functions if needed
    
    // Verify all services are loaded
    if (!window.DataManager) {
        console.error('❌ DataManager not loaded! Make sure services/data-manager.js is loaded before app-services.js');
    }
    if (!window.Backend) {
        console.error('❌ Backend not loaded! Make sure services/backend-client.js is loaded before app-services.js');
    }
}
