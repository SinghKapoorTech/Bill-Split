// Feature descriptions for the marketing cards
export const FEATURES = {
  AI_POWERED: {
    title: 'AI-Powered',
    description: 'Gemini AI extracts items, tax, and tip automatically',
  },
  FAIR_SPLITTING: {
    title: 'Fair Splitting',
    description: 'Assign items to people with proportional tax & tip',
  },
  INSTANT_RESULTS: {
    title: 'Instant Results',
    description: 'See who owes what in seconds, no manual math needed',
  },
} as const;

// Common UI text and labels
export const UI_TEXT = {
  // Page titles
  PROFILE_SETTINGS: 'Profile & Settings',
  SPLIT_YOUR_BILL: 'Split Your Bill Instantly',
  CREATE_BILL_MANUALLY: 'Create Bill Manually',
  HERO_TITLE: 'Split Bills with Friends',
  HERO_SUBTITLE: 'Upload a receipt or add items manually. We handle the math, tax, and tip.',

  // Sections
  BILL_ITEMS: 'Bill Items',
  SPLIT_SUMMARY: 'Split Summary',

  // Actions
  START_OVER: 'Start Over',
  SAVE_CHANGES: 'Save Changes',
  SAVING: 'Saving...',
  CANCEL: 'Cancel',
  ADD_ITEM: 'Add Item',
  SPLIT_EVENLY: 'Split Evenly',
  EDIT: 'Edit',
  DELETE: 'Delete',
  SAVE: 'Save',

  // Auth
  SIGN_IN: 'Sign In',
  SIGN_IN_REQUIRED: 'Sign in required',
  SIGN_OUT: 'Sign out',

  // Venmo
  VENMO_USERNAME: 'Venmo Username',
  VENMO_WITHOUT_AT: '(without @)',
  VENMO_ID: 'Venmo ID',
  CHARGE_ON_VENMO: 'Charge on Venmo',

  // Instructions
  ADD_PEOPLE_TO_ASSIGN: 'Add people above to assign items',
  UPLOAD_RECEIPT_INSTRUCTION: 'Upload a photo of your receipt and let AI do the math. Fair splitting with tax and tip included.',
  MANUAL_BILL_INSTRUCTION: 'Add items and people to split the bill fairly. Tax and tip distributed proportionally.',

  // Empty states
  NO_ITEMS_YET: 'No items yet. Click "Add Item" to get started.',
  NO_FRIENDS_YET: 'No friends saved yet. Add friends to quickly add them to bills.',
  NO_SQUADS_YET: 'No squads yet. Create a squad to quickly add groups to bills.',
} as const;

// Form labels and placeholders
export const FORM_LABELS = {
  ITEM_NAME: 'Item Name',
  ENTER_ITEM_NAME: 'Enter item name',
  PRICE: 'Price',
  PRICE_PLACEHOLDER: '0.00',
  ASSIGN_TO: 'Assign to:',
} as const;

// Navigation labels
export const NAVIGATION = {
  AI_SCAN: 'AI Scan',
  GROUPS: 'Groups',
  BACK_TO_GROUPS: 'Back to Groups',
} as const;

// Loading and status messages
export const LOADING = {
  LOADING_GROUP: 'Loading group...',
  GROUP_NOT_FOUND: 'Group not found',
  LOADING_SQUADS: 'Loading squads...',
} as const;

// Error and validation messages
export const ERROR_MESSAGES = {
  NAME_REQUIRED: 'Name required',
  NAME_REQUIRED_DESC: "Please enter a friend's name.",
  VENMO_ID_REQUIRED: 'Venmo ID required',
  VENMO_ID_REQUIRED_DESC: 'Please add your Venmo ID in Profile Settings first.',
  ASSIGN_ALL_ITEMS: 'Please assign all items to see the split summary',
  SIGN_IN_FOR_VENMO: 'Please sign in to charge people on Venmo.',
} as const;

// Success messages
export const SUCCESS_MESSAGES = {
  PROFILE_UPDATED: 'Profile updated',
  PROFILE_UPDATED_DESC: 'Your Venmo ID has been updated successfully.',
  FRIENDS_UPDATED: 'Friends updated',
  FRIENDS_UPDATED_DESC: 'Your friends list has been updated successfully.',
} as const;

// Dialog descriptions
export const DIALOG_DESCRIPTIONS = {
  PROFILE_SETTINGS: 'Update your Venmo ID to enable charging others for their split.',
  MANAGE_FRIENDS: 'Add or remove friends to quickly add them to bills.',
  MANAGE_SQUADS: 'Create and manage groups of people to quickly add them to bills.',
} as const;
