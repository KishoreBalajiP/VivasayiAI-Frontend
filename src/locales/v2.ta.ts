import type { V2Key } from './v2.en';

// Tamil for every key in v2.en.ts. The Record type is the compile-time parity check: a missing
// key, or a key English does not have, fails `npm run typecheck`.
//
// NEEDS NATIVE-SPEAKER REVIEW before release (plan B8). Keep {{placeholders}} identical to English.
export const taV2: Record<V2Key, string> = {
  // ── UI primitives ───────────────────────────────────────────────────────────────────────
  statusPrefix: 'நிலை:',
  stepperStatus_complete: 'முடிந்தது',
  stepperStatus_current: 'தற்போதைய படி',
  stepperStatus_upcoming: 'இன்னும் தொடங்கவில்லை',
  stepperStatus_active: 'நடைபெறுகிறது',
  stepperStatus_waiting: 'காத்திருக்கிறது',
  stepperStatus_blocked: 'கவனம் தேவை',
  stepperStatus_failed: 'முடிக்க முடியவில்லை',
  stepperStatus_skipped: 'தேவையில்லை',

  // ── Header / navigation ─────────────────────────────────────────────────────────────────
  account: 'கணக்கு',
  closeMenu: 'பட்டியலை மூடு',
  headerFarmDistrict: 'பண்ணை: {{district}}',
  headerFarmDistrictTitle: 'உங்கள் பண்ணை சுயவிவரத்தில் உள்ள பண்ணை மாவட்டம். மாற்ற தட்டவும்.',
  headerSetFarmDistrict: 'பண்ணை மாவட்டத்தை அமைக்கவும்',
  headerSetFarmDistrictTitle:
    'உங்கள் பண்ணைக்கான வானிலை மற்றும் ஆலோசனையைப் பெற பண்ணை மாவட்டத்தைச் சேர்க்கவும்.',

  // ── Weather strip (farm-first) ──────────────────────────────────────────────────────────
  weatherForFarm: 'உங்கள் பண்ணை மாவட்ட வானிலை: {{district}}',
  weatherNearYou: 'உங்கள் அருகிலுள்ள வானிலை: {{district}}',
  weatherApproximate: '(தோராயமாக)',
  weatherUseDevice: 'என் தற்போதைய இருப்பிடத்தைப் பயன்படுத்து',
  weatherShowDetails: 'வானிலை விவரங்களைக் காட்டு',
  weatherHideDetails: 'வானிலை விவரங்களை மறை',
  weatherUseFarm: 'பண்ணை இருப்பிடத்தைப் பயன்படுத்து ({{district}})',
  weatherDeviceOutsideTn:
    'உங்கள் சாதனம் தமிழ்நாட்டிற்கு வெளியே ({{state}}) இருப்பதாகத் தெரிகிறது. வானிலை தற்போது உங்கள் பண்ணை மாவட்டத்திற்குக் காட்டப்படுகிறது: {{district}}.',
  weatherDeviceOutsideTnNoState:
    'உங்கள் சாதனம் தமிழ்நாட்டிற்கு வெளியே உள்ளது. வானிலை தற்போது உங்கள் பண்ணை மாவட்டத்திற்குக் காட்டப்படுகிறது: {{district}}.',
  weatherDeviceOutsideTnNoFarm:
    'உங்கள் சாதனம் தமிழ்நாட்டிற்கு வெளியே இருப்பதாகத் தெரிகிறது. நேரடி வானிலை தமிழ்நாடு மாவட்டங்களுக்கு மட்டுமே கிடைக்கும். வானிலையைக் காண உங்கள் பண்ணை மாவட்டத்தை அமைக்கவும்.',
  weatherDeviceDeniedFarm:
    'இருப்பிட அனுமதி வழங்கப்படவில்லை. வானிலை தற்போது உங்கள் பண்ணை மாவட்டத்திற்குக் காட்டப்படுகிறது: {{district}}.',
  weatherDeviceDeniedNoFarm:
    'இருப்பிட அனுமதி வழங்கப்படவில்லை. உள்ளூர் வானிலையைக் காண உங்கள் பண்ணை மாவட்டத்தை அமைக்கவும்.',
  weatherDeviceUnavailableFarm:
    'உங்கள் சாதன இருப்பிடம் இப்போது கிடைக்கவில்லை. வானிலை தற்போது உங்கள் பண்ணை மாவட்டத்திற்குக் காட்டப்படுகிறது: {{district}}.',
  weatherDeviceUnavailableNoFarm:
    'உங்கள் சாதன இருப்பிடம் இப்போது கிடைக்கவில்லை. உள்ளூர் வானிலையைக் காண உங்கள் பண்ணை மாவட்டத்தை அமைக்கவும்.',
  weatherSetFarmPrompt: 'உள்ளூர் வானிலையைக் காண உங்கள் பண்ணை மாவட்டத்தை அமைக்கவும்.',
  weatherSetFarmCta: 'பண்ணை மாவட்டத்தை அமை',
  weatherRainLabel: 'மழை',

  // ── Landing page (farm-first) ───────────────────────────────────────────────────────────
  landingFarmFirstTitle: 'உங்கள் பண்ணைக்கான வானிலை மற்றும் ஆலோசனை',
  landingFarmFirstBody:
    'உள்நுழைந்த பின், உங்கள் பண்ணை சுயவிவரத்தில் உள்ள பண்ணை மாவட்டத்தைப் பயன்படுத்துகிறோம். நீங்கள் தேர்வு செய்தால் மட்டுமே உங்கள் சாதன இருப்பிடம் பயன்படுத்தப்படும்.',
  // ── Claim wizard (five steps: Parcel, Your land, Event, Evidence, Review) ───────────────────
  wizardStepsLabel: 'கோரிக்கையின் படிகள்',
  wizardEventTitle: 'என்ன நடந்தது?',
  wizardLockedNote:
    'இந்தக் கோரிக்கை ஏற்கெனவே சேமிக்கப்பட்டுவிட்டது. எனவே நிலப் பகுதி, நிலத்துடன் உங்கள் உறவு, நிகழ்வு விவரங்களை இங்கே இனி மாற்ற முடியாது.',
  wizardMissingTitle: 'தொடர, இவை தேவை:',
  wizardEventMissing_event_type: 'சேதத்திற்கான காரணத்தைத் தேர்வு செய்யவும்.',
  wizardEventMissing_date: 'சேதம் ஏற்பட்ட தேதியைத் தேர்வு செய்யவும் (கடந்த 30 நாட்களுக்குள்).',
  wizardEventMissing_area: 'பாதிக்கப்பட்ட பகுதியைத் தேர்வு செய்யவும்: முழு நிலப் பகுதி, அல்லது சேதமடைந்த பகுதியை வரையவும்.',

  wizardEvidenceTitle: 'புகைப்படங்களும் நில ஆவணங்களும்',
  wizardPhotosTitle: 'பயிர்ப் புகைப்படங்கள்',
  wizardRequired: 'கட்டாயம்',
  wizardRecommended: 'பரிந்துரைக்கப்படுகிறது',
  wizardPhotosCount: '{{max}} புகைப்படங்களில் {{count}}',
  wizardPhotosHint:
    'சேதத்தைச் சரிபார்க்க குறைந்தது {{min}} புகைப்படம் தேவை. சேதமடைந்த பயிரின் தெளிவான புகைப்படங்களைச் சேர்க்கவும்: JPEG, PNG அல்லது WebP, ஒவ்வொன்றும் 5 MB வரை, அதிகபட்சம் {{max}} புகைப்படங்கள்.',
  wizardAddPhotos: 'புகைப்படங்களைச் சேர்',
  wizardPhotoLimitReached:
    'அனுமதிக்கப்பட்ட அதிகபட்சமான {{max}} புகைப்படங்களைச் சேர்த்துவிட்டீர்கள். வேறொன்றைச் சேர்க்க ஒன்றை நீக்கவும்.',
  wizardPhotoLimitSkipped:
    'அதிகபட்சம் {{max}} புகைப்படங்களை மட்டுமே சேர்க்க முடியும். நீங்கள் தேர்ந்தெடுத்த சில புகைப்படங்கள் சேர்க்கப்படவில்லை.',
  wizardNoPhotos: 'இன்னும் புகைப்படங்கள் எதுவும் சேர்க்கப்படவில்லை.',
  wizardFileRejected: '"{{name}}" சேர்க்கப்படவில்லை. {{reason}}',
  wizardFileMissing: 'கோப்பு இனி கிடைக்கவில்லை. அதை மீண்டும் தேர்வு செய்யவும்.',
  wizardPhotoThumbAlt: '{{name}} முன்னோட்டம்',
  wizardItemStatus_staged: 'பதிவேற்றத் தயார்',
  wizardItemStatus_uploaded: 'பதிவேற்றப்பட்டது',
  wizardItemStatus_missing_file: 'இன்னும் பதிவேற்றப்படவில்லை. இந்தக் கோப்பை மீண்டும் தேர்வு செய்யவும் அல்லது நீக்கவும்.',
  wizardRetryItem: '{{name}} கோப்பை மீண்டும் பதிவேற்று',
  wizardChooseAgain: 'மீண்டும் தேர்வு செய்',
  wizardChooseAgainItem: '{{name}} கோப்பை மீண்டும் தேர்வு செய்',
  wizardRemovePhoto: '{{name}} புகைப்படத்தை நீக்கு',
  wizardRemoveDocument: '{{name}} ஆவணத்தை நீக்கு',
  wizardRemoveUploadedTitle: 'பதிவேற்றிய இந்தப் புகைப்படத்தை நீக்கவா?',
  wizardRemoveUploadedBody:
    'இந்தப் புகைப்படம் ஏற்கெனவே உங்கள் கோரிக்கையுடன் சேமிக்கப்பட்டுள்ளது. நீக்கினால் அது கோரிக்கையிலிருந்து அழிக்கப்படும்.',
  wizardRemoveFailed: 'புகைப்படத்தை நீக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',

  wizardDocumentsCount: '{{max}} ஆவணங்களில் {{count}}',
  wizardDocumentsHint:
    'பரிந்துரைக்கப்படுகிறது. இவை இல்லாமலும் சமர்ப்பிக்கலாம்; உங்கள் கோரிக்கையை முடிவு செய்ய இவை தேவைப்பட்டால், கோரிக்கைப் பக்கம் உங்களுக்குத் தெரிவிக்கும்.',
  wizardDocumentGroupAdded: 'சேர்க்கப்பட்டது',
  wizardDocumentGroupMissing: 'இன்னும் சேர்க்கப்படவில்லை',
  wizardAddDocument: 'நில ஆவணத்தைச் சேர்',
  wizardDocumentLimitReached:
    'இங்கே அதிகபட்சம் {{max}} நில ஆவணங்களைச் சேர்க்கலாம். மேலும் ஆவணங்களைப் பின்னர் கோரிக்கைப் பக்கத்திலிருந்து சேர்க்கலாம்.',
  wizardDocumentLimitSkipped:
    'இங்கே அதிகபட்சம் {{max}} நில ஆவணங்களை மட்டுமே சேர்க்க முடியும். நீங்கள் தேர்ந்தெடுத்த சில கோப்புகள் சேர்க்கப்படவில்லை.',
  wizardDocumentCategoryFor: '{{name}} — ஆவண வகை',
  wizardDocumentAttachedNote: 'உங்கள் கோரிக்கையுடன் சேர்க்கப்பட்டது. இதை இங்கே நீக்க முடியாது.',
  wizardDocumentStatus_staged: 'பதிவேற்றத் தயார்',
  wizardDocumentStatus_uploading: 'பதிவேற்றப்படுகிறது…',
  wizardDocumentStatus_uploaded: 'பதிவேற்றப்பட்டது; இன்னும் கோரிக்கையுடன் சேர்க்கப்படவில்லை',
  wizardDocumentStatus_attaching: 'உங்கள் கோரிக்கையுடன் சேர்க்கப்படுகிறது…',
  wizardDocumentStatus_attached: 'உங்கள் கோரிக்கையுடன் சேர்க்கப்பட்டது',
  wizardDocumentStatus_failed: 'சேர்க்க முடியவில்லை',
  wizardDocumentStatus_missing_file:
    'இன்னும் பதிவேற்றப்படவில்லை. இந்தக் கோப்பை மீண்டும் தேர்வு செய்யவும் அல்லது நீக்கவும்.',
  evidenceDocsAiNote:
    'சரிபார்ப்பாளருக்கு உதவ உங்கள் ஆவணங்கள் தானியங்கியாகப் படிக்கப்படலாம். தானியங்கி வாசிப்பு அதிகாரப்பூர்வ அரசு சரிபார்ப்பு அல்ல.',
  wizardEvidenceMissing_photos: 'சேதமடைந்த பயிரின் குறைந்தது ஒரு புகைப்படத்தைச் சேர்க்கவும்.',
  wizardEvidenceMissing_missing_files:
    '"இன்னும் பதிவேற்றப்படவில்லை" எனக் குறிக்கப்பட்ட புகைப்படங்களையும் ஆவணங்களையும் மீண்டும் தேர்வு செய்யவும் அல்லது நீக்கவும்.',

  wizardEdit: 'திருத்து',
  wizardEditSection: '{{section}} — திருத்து',
  wizardReviewParcelName: 'பெயர்',
  wizardReviewPhotoCount: '{{count}} புகைப்படம்(ங்கள்)',
  wizardReviewNoDocuments: 'எதுவும் சேர்க்கப்படவில்லை',
  wizardReviewChecksNote:
    'நீங்கள் சமர்ப்பித்தவுடன் சரிபார்ப்புகள் தானாகவே தொடங்கும். ஒவ்வொரு சரிபார்ப்பையும் கோரிக்கைப் பக்கத்தில் பின்தொடரலாம்.',
  wizardReviewAiNote:
    'சரிபார்ப்புக்கு உதவ புகைப்படங்களும் ஆவணங்களும் தானியங்கியாகப் படிக்கப்படலாம். தானியங்கி வாசிப்பு அதிகாரப்பூர்வ அரசு சரிபார்ப்பு அல்ல.',
  reviewReason_no_photos: 'சேதத்தின் குறைந்தது ஒரு புகைப்படத்தைச் சேர்க்கவும்.',
  reviewReason_missing_files:
    'சில புகைப்படங்கள் அல்லது ஆவணங்கள் பதிவேற்றப்படவில்லை. அவற்றை மீண்டும் தேர்வு செய்யவும் அல்லது நீக்கவும்.',

  wizardSubmittingTitle: 'உங்கள் கோரிக்கை அனுப்பப்படுகிறது',
  wizardPhase_create: 'கோரிக்கையைச் சேமித்தல்',
  wizardPhase_photos: 'புகைப்படங்களைப் பதிவேற்றுதல்',
  wizardPhase_documents: 'நில ஆவணங்களைப் பதிவேற்றுதல்',
  wizardPhase_submit: 'சமர்ப்பித்தல்',
  wizardPhaseProgress: '{{total}}-இல் {{done}}',

  submitErrorTitle_create: 'உங்கள் கோரிக்கையைச் சேமிக்க முடியவில்லை',
  submitErrorTitle_photos: 'சில புகைப்படங்களைப் பதிவேற்ற முடியவில்லை',
  submitErrorTitle_documents: 'சில நில ஆவணங்களைச் சேர்க்க முடியவில்லை',
  submitErrorTitle_submit: 'உங்கள் கோரிக்கை சேமிக்கப்பட்டது, ஆனால் இன்னும் சமர்ப்பிக்கப்படவில்லை',
  submitError_rate_claims:
    'கோரிக்கைச் செயல்களுக்கான ஒரு மணிநேர வரம்பை அடைந்துவிட்டீர்கள். உங்கள் வரைவு சேமிக்கப்பட்டுள்ளது; பின்னர் மீண்டும் முயற்சிக்கவும்.',
  submitError_rate_upload:
    'ஒரு நிமிடத்தில் அதிகமான பதிவேற்றங்கள். ஒரு நிமிடம் காத்திருந்து, பிறகு "மீண்டும் முயற்சி" என்பதைத் தட்டவும்.',
  submitError_rate_evidence:
    'இந்த ஒரு மணிநேரத்தில் அதிகமான புகைப்பட, ஆவணப் பதிவேற்றங்கள். உங்கள் வரைவு சேமிக்கப்பட்டுள்ளது; பின்னர் மீண்டும் முயற்சிக்கவும்.',
  submitError_submit_unavailable:
    'உங்கள் கோரிக்கை சேமிக்கப்பட்டது, ஆனால் சரிபார்ப்புகளை இன்னும் தொடங்க முடியவில்லை. "மீண்டும் முயற்சி" என்பதைத் தட்டவும்.',
  submitError_unavailable:
    'சேவை இப்போது பரபரப்பாக உள்ளது. உங்கள் வரைவு சேமிக்கப்பட்டுள்ளது; சிறிது நேரத்தில் "மீண்டும் முயற்சி" என்பதைத் தட்டவும்.',
  submitError_network:
    'இணைய இணைப்பு இல்லை. உங்கள் வரைவு சேமிக்கப்பட்டுள்ளது; இணைப்பு திரும்பியதும் "மீண்டும் முயற்சி" என்பதைத் தட்டவும்.',
  submitError_conflict:
    'இந்தக் கோரிக்கை வேறு இடத்தில் மாற்றப்பட்டுள்ளது. அதன் நிலையைக் காண சேமித்த கோரிக்கையைத் திறக்கவும்.',
  submitError_bad_request: 'சில விவரங்கள் ஏற்கப்படவில்லை. மேலே உள்ள படிகளைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.',
  submitError_items_failed:
    'தோல்வி எனக் குறிக்கப்பட்டவற்றை மீண்டும் முயற்சிக்கவும் அல்லது நீக்கவும்; பிறகு "மீண்டும் முயற்சி" என்பதைத் தட்டவும்.',
  submitError_missing_files: 'சமர்ப்பிக்கும் முன் சில புகைப்படங்களையோ ஆவணங்களையோ மீண்டும் தேர்வு செய்ய வேண்டும்.',
  submitError_generic: 'ஏதோ தவறு நடந்தது. உங்கள் வரைவு சேமிக்கப்பட்டுள்ளது; "மீண்டும் முயற்சி" என்பதைத் தட்டவும்.',
  wizardOpenSavedClaim: 'சேமித்த கோரிக்கையைத் திற',

  wizardDraftRestoredTitle: 'உங்கள் வரைவை மீட்டெடுத்தோம்',
  wizardDraftRestoredBody: 'நீங்கள் முன்பு அளித்த பதில்கள் திரும்ப வந்துள்ளன; விட்ட இடத்திலிருந்து தொடரலாம்.',
  wizardDraftRestoredMissing: 'பதிவேற்றப்படாத புகைப்படங்களையும் ஆவணங்களையும் மீண்டும் சேர்க்க வேண்டும்.',
  wizardDraftRestoredDate: 'சேமிக்கப்பட்ட நிகழ்வு தேதி இனி ஏற்கப்படாது. நிகழ்வுப் படியில் அதைச் சரிபார்க்கவும்.',
  wizardStartOver: 'புதிதாகத் தொடங்கு',
  wizardStartOverTitle: 'புதிதாகத் தொடங்கவா?',
  wizardStartOverBody: 'இந்தப் படிவத்தில் நீங்கள் உள்ளிட்ட அனைத்தும் அழிக்கப்படும்.',
  wizardStartOverSavedNote: 'ஏற்கெனவே சேமிக்கப்பட்ட கோரிக்கை "என் கோரிக்கைகள்" பகுதியில் வரைவாகவே இருக்கும்.',
  wizardStartOverConfirm: 'அழித்துவிட்டுப் புதிதாகத் தொடங்கு',

  // ── Claim tracker (plan B4) ─────────────────────────────────────────────────────────────
  trackerStagesTitle: 'உங்கள் கோரிக்கையின் சோதனைகள்',
  trackerLastUpdated: 'கடைசி மாற்றம் {{time}}',
  trackerLastUpdatedNone: 'இன்னும் மாற்றம் இல்லை',
  trackerChecked: 'கடைசியாகப் பார்த்தது {{time}}',
  trackerStale: 'முன்பு சேமித்த நிலை காட்டப்படுகிறது. புதிய தகவலைப் பார்க்கிறோம்…',
  trackerRefresh: 'புதிய தகவலைப் பார்',
  trackerRefreshing: 'பார்க்கிறோம்…',
  trackerRefreshErrorTitle: 'புதிய தகவலைப் பெற முடியவில்லை',
  trackerRefreshErrorBody: 'கடைசியாகக் கிடைத்த நிலை காட்டப்படுகிறது. நாங்கள் தானாகவே மீண்டும் முயற்சிப்போம்.',
  trackerRateLimitedBody: 'குறுகிய நேரத்தில் அதிக முறை பார்க்கப்பட்டது. சுமார் ஒரு நிமிடத்தில் மீண்டும் முயற்சிப்போம்.',
  trackerOfflineTitle: 'இணைய இணைப்பு இல்லை',
  trackerOfflineBody: 'கடைசியாகக் கிடைத்த நிலை காட்டப்படுகிறது. இணைப்பு மீண்டும் கிடைத்ததும் பார்ப்பது தொடரும்.',
  trackerLoadFailedTitle: 'இந்தக் கோரிக்கையின் முன்னேற்றத்தை ஏற்ற முடியவில்லை',
  trackerLoadFailedBody: 'உங்கள் இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.',
  trackerCopyReference: 'குறிப்பு எண் {{ref}} ஐ நகலெடு',
  trackerReferenceCopied: 'குறிப்பு எண் நகலெடுக்கப்பட்டது.',
  trackerSubmittedOn: 'சமர்ப்பித்தது: {{date}}',
  trackerNotSubmitted: 'இன்னும் சமர்ப்பிக்கப்படவில்லை',
  trackerNextCheck: 'அடுத்த சோதனை சுமார் {{time}}',
  trackerLegacyNote:
    'இந்தக் கோரிக்கையின் படிப்படியான முன்னேற்றம் இப்போது கிடைக்கவில்லை; அதனால் ஒட்டுமொத்த நிலை மட்டும் காட்டப்படுகிறது.',
  trackerUnsupportedNote:
    'இந்தக் கோரிக்கையின் படிப்படியான முன்னேற்றத்தைக் காட்ட இந்தச் செயலியைப் புதுப்பிக்க வேண்டும். ஒட்டுமொத்த நிலை கீழே காட்டப்படுகிறது.',
  trackerHeldDetails: 'ஒவ்வொரு சோதனையின் விவரங்கள்',
  trackerFactsTitle: 'நீங்கள் தாக்கல் செய்தவை',
  trackerDecisionTitle: 'முடிவு',
  trackerDecisionLoading: 'முடிவின் விவரங்களை ஏற்றுகிறோம்…',
  trackerActionsTitle: 'இப்போது நீங்கள் செய்யக்கூடியவை',
  actionRequiredBadge: 'கட்டாயம்',
  actionRecommendedBadge: 'பரிந்துரைக்கப்படுகிறது',

  progressOverall_draft: 'இன்னும் சமர்ப்பிக்கப்படவில்லை',
  progressOverall_in_progress: 'சோதனைகள் நடைபெறுகின்றன',
  progressOverall_waiting_for_review: 'சரிபார்ப்பாளருக்காகக் காத்திருக்கிறது',
  progressOverall_action_required: 'உங்கள் நடவடிக்கை தேவை',
  progressOverall_decided: 'முடிவு எடுக்கப்பட்டது',
  progressOverall_withdrawn: 'திரும்பப் பெறப்பட்டது',
  progressOverall_unknown: 'நிலை கிடைக்கவில்லை',
  progressOverallBody_draft: 'இந்தக் கோரிக்கை வரைவாகச் சேமிக்கப்பட்டுள்ளது. நீங்கள் சமர்ப்பித்த பிறகு சோதனைகள் தொடங்கும்.',
  progressOverallBody_in_progress:
    'உங்கள் கோரிக்கை தானாகவே சோதிக்கப்படுகிறது. நீங்கள் எதுவும் செய்ய வேண்டியதில்லை; இந்தப் பக்கம் தானாகவே புதுப்பிக்கப்படும்.',
  progressOverallBody_waiting_for_review:
    'முடிவு எடுப்பதற்கு முன் ஒருவர் உங்கள் கோரிக்கையைப் பார்ப்பார். காத்திருக்கும் வரை உங்கள் கோரிக்கை சமர்ப்பிக்கப்பட்ட நிலையிலேயே இருக்கும்.',
  progressOverallBody_action_required: 'உங்கள் கோரிக்கை முன்னேற உங்களிடமிருந்து ஒன்று தேவை. கீழே பாருங்கள்.',
  progressOverallBody_decided: 'உங்கள் கோரிக்கைக்கு முடிவு எடுக்கப்பட்டுள்ளது. முடிவு கீழே காட்டப்படுகிறது.',
  progressOverallBody_withdrawn: 'இந்தக் கோரிக்கையை நீங்கள் திரும்பப் பெற்றுவிட்டீர்கள். இனி எதுவும் சோதிக்கப்படாது.',
  progressOverallBody_unknown: 'சமீபத்திய நிலையைப் படிக்க முடியவில்லை. சிறிது நேரத்தில் மீண்டும் பாருங்கள்.',

  progressStage_received: 'கோரிக்கை பெறப்பட்டது',
  progressStage_photos: 'பயிர் புகைப்படங்கள்',
  progressStage_land_documents: 'நில ஆவணங்கள்',
  progressStage_weather: 'வானிலை',
  progressStage_area_checks: 'பரப்புச் சோதனைகள்',
  progressStage_decision: 'முடிவு',
  progressStage_unknown: 'மற்றொரு சோதனை',

  progressStatus_pending: 'தொடங்கவில்லை',
  progressStatus_active: 'நடைபெறுகிறது',
  progressStatus_complete: 'முடிந்தது',
  progressStatus_waiting: 'காத்திருக்கிறது',
  progressStatus_blocked: 'உங்கள் நடவடிக்கை தேவை',
  progressStatus_not_applicable: 'தேவையில்லை',
  progressStatus_failed_technical: 'முடிக்க முடியவில்லை',
  progressStatus_unknown: 'நிலை கிடைக்கவில்லை',

  progressStatusExplain_pending: 'இந்தச் சோதனை இன்னும் தொடங்கவில்லை.',
  progressStatusExplain_active: 'இந்தச் சோதனை இப்போது நடைபெறுகிறது.',
  progressStatusExplain_complete: 'இந்தச் சோதனை முடிந்தது.',
  progressStatusExplain_waiting: 'இந்தச் சோதனை காத்திருக்கிறது; தானாகவே தொடரும்.',
  progressStatusExplain_blocked: 'இந்தச் சோதனைக்கு உங்களிடமிருந்து ஒன்று தேவை.',
  progressStatusExplain_not_applicable: 'உங்கள் கோரிக்கைக்கு இந்தச் சோதனை தேவையில்லை.',
  progressStatusExplain_failed_technical:
    'இந்தச் சோதனையை முடிக்க முடியவில்லை. ஒரு சரிபார்ப்பாளர் உங்கள் கோரிக்கையைப் பார்ப்பார்; இது உங்கள் கோரிக்கையில் உள்ள பிரச்சனை அல்ல.',
  progressStatusExplain_unknown: 'இந்தச் சோதனையின் நிலை இப்போது கிடைக்கவில்லை.',

  progress_received_waiting_for_submit: 'சோதனைகளைத் தொடங்க உங்கள் கோரிக்கையைச் சமர்ப்பிக்கவும்.',
  progress_received_complete: 'உங்கள் கோரிக்கை எங்களுக்குக் கிடைத்தது.',
  progress_received_not_submitted: 'இந்தக் கோரிக்கை ஒருபோதும் சமர்ப்பிக்கப்படவில்லை.',
  progress_photos_missing: 'இன்னும் புகைப்படம் இல்லை. சேதமடைந்த பயிரின் குறைந்தது ஒரு புகைப்படத்தைச் சேர்க்கவும்.',
  progress_photos_waiting_for_submit: 'நீங்கள் சமர்ப்பித்த பிறகு உங்கள் புகைப்படங்கள் சோதிக்கப்படும்.',
  progress_photos_queued: 'உங்கள் புகைப்படங்கள் சோதனைக்காகக் காத்திருக்கின்றன.',
  progress_photos_checking: 'உங்கள் புகைப்படங்கள் இப்போது சோதிக்கப்படுகின்றன.',
  progress_photos_retrying_technical:
    'புகைப்படச் சோதனைச் சேவை தற்போது பரபரப்பாக உள்ளது. நாங்கள் தானாகவே மீண்டும் முயற்சிப்போம்; இது உங்கள் புகைப்படங்களில் உள்ள பிரச்சனை அல்ல.',
  progress_photos_technical_issue_reviewer:
    'தானியங்கி புகைப்படச் சோதனையை முடிக்க முடியவில்லை. அதற்குப் பதிலாக ஒரு சரிபார்ப்பாளர் உங்கள் புகைப்படங்களைப் பார்ப்பார்.',
  progress_photos_complete: 'உங்கள் புகைப்படங்கள் சோதிக்கப்பட்டன.',
  progress_photos_not_checked: 'இந்தக் கோரிக்கைக்குப் புகைப்படங்கள் தானாகச் சோதிக்கப்படவில்லை.',
  progress_photos_claim_withdrawn: 'கோரிக்கை திரும்பப் பெறப்பட்டதால் சோதிக்கப்படவில்லை.',
  progress_land_documents_none_attached: 'நில ஆவணங்கள் எதுவும் சேர்க்கப்படவில்லை.',
  progress_land_documents_waiting_for_submit: 'நீங்கள் சமர்ப்பித்த பிறகு உங்கள் நில ஆவணங்கள் படிக்கப்படும்.',
  progress_land_documents_queued: 'உங்கள் நில ஆவணங்கள் படிக்கப்படுவதற்காகக் காத்திருக்கின்றன.',
  progress_land_documents_checking: 'உங்கள் நில ஆவணங்கள் இப்போது படிக்கப்படுகின்றன.',
  progress_land_documents_retrying_technical:
    'ஆவணம் படிக்கும் சேவை தற்போது பரபரப்பாக உள்ளது. நாங்கள் தானாகவே மீண்டும் முயற்சிப்போம்; இது உங்கள் ஆவணங்களில் உள்ள பிரச்சனை அல்ல.',
  progress_land_documents_technical_issue_reviewer:
    'உங்கள் ஆவணங்களைத் தானாகப் படிக்க முடியவில்லை. அதற்குப் பதிலாக ஒரு சரிபார்ப்பாளர் அவற்றைப் பார்ப்பார்.',
  progress_land_documents_complete:
    'உங்கள் நில ஆவணங்கள் படிக்கப்பட்டன. தானியங்கி வாசிப்பு அதிகாரப்பூர்வ அரசு சரிபார்ப்பு அல்ல.',
  progress_land_documents_not_checked: 'இந்தக் கோரிக்கைக்கு நில ஆவணங்கள் தானாகப் படிக்கப்படவில்லை.',
  progress_land_documents_claim_withdrawn: 'கோரிக்கை திரும்பப் பெறப்பட்டதால் படிக்கப்படவில்லை.',
  progress_weather_waiting_for_submit: 'நீங்கள் சமர்ப்பித்த பிறகு வானிலைப் பதிவுகள் சோதிக்கப்படும்.',
  progress_weather_queued: 'வானிலைப் பதிவுகள் சோதனைக்காகக் காத்திருக்கின்றன.',
  progress_weather_checking: 'உங்கள் பகுதியின் வானிலைப் பதிவுகள் இப்போது சோதிக்கப்படுகின்றன.',
  progress_weather_retrying_technical: 'வானிலைச் சேவை தற்போது பரபரப்பாக உள்ளது. நாங்கள் தானாகவே மீண்டும் முயற்சிப்போம்.',
  progress_weather_complete: 'வானிலைப் பதிவுகள் சோதிக்கப்பட்டன. வானிலை துணைத் தகவல் மட்டுமே.',
  progress_weather_unavailable_supporting_only:
    'வானிலைப் பதிவுகள் கிடைக்கவில்லை. வானிலை துணைத் தகவல் மட்டுமே என்பதால் இது உங்களுக்கு எதிராகக் கணக்கிடப்படாது.',
  progress_weather_not_checked: 'இந்தக் கோரிக்கைக்கு வானிலைப் பதிவுகள் சோதிக்கப்படவில்லை.',
  progress_weather_claim_withdrawn: 'கோரிக்கை திரும்பப் பெறப்பட்டதால் சோதிக்கப்படவில்லை.',
  progress_area_checks_waiting_for_submit: 'நீங்கள் சமர்ப்பித்த பிறகு நீங்கள் கோரிய பரப்பு சோதிக்கப்படும்.',
  progress_area_checks_queued: 'நீங்கள் கோரிய பரப்பு சோதனைக்காகக் காத்திருக்கிறது.',
  progress_area_checks_checking:
    'நீங்கள் கோரிய பரப்பு உங்கள் நிலப் பகுதி மற்றும் பிற கோரிக்கைகளுடன் ஒப்பிட்டுச் சோதிக்கப்படுகிறது.',
  progress_area_checks_technical_issue_reviewer:
    'பரப்புச் சோதனையை முடிக்க முடியவில்லை. ஒரு சரிபார்ப்பாளர் உங்கள் கோரிக்கையைப் பார்ப்பார்.',
  progress_area_checks_complete: 'நீங்கள் கோரிய பரப்பு சோதிக்கப்பட்டது.',
  progress_area_checks_not_checked: 'இந்தக் கோரிக்கைக்குப் பரப்பு தானாகச் சோதிக்கப்படவில்லை.',
  progress_area_checks_claim_withdrawn: 'கோரிக்கை திரும்பப் பெறப்பட்டதால் சோதிக்கப்படவில்லை.',
  progress_decision_waiting_for_submit: 'உங்கள் கோரிக்கை சமர்ப்பிக்கப்பட்டுச் சோதிக்கப்பட்ட பிறகு முடிவு எடுக்கப்படும்.',
  progress_decision_waiting_for_checks: 'மேலே உள்ள சோதனைகள் முடிந்ததும் முடிவு தானாகவே எடுக்கப்படும்.',
  progress_decision_deciding: 'உங்கள் கோரிக்கைக்கு இப்போது முடிவு எடுக்கப்படுகிறது.',
  progress_decision_ai_no_damage_review:
    'தானியங்கி புகைப்படச் சோதனையில் பயிர் சேதம் தெரியவில்லை. எந்த முடிவும் எடுப்பதற்கு முன் ஒருவர் உங்கள் புகைப்படங்களைப் பார்ப்பார்.',
  progress_decision_held_retrying_checks:
    'ஒரு சோதனை இன்னும் முடியவில்லை; அது மீண்டும் முயற்சிக்கப்படுகிறது. முடிவு அதற்காகக் காத்திருக்கிறது.',
  progress_decision_technical_issue_reviewer:
    'சில சோதனைகளை முடிக்க முடியவில்லை. ஒரு சரிபார்ப்பாளர் உங்கள் கோரிக்கையைப் பார்ப்பார்; இது உங்கள் கோரிக்கையில் உள்ள பிரச்சனை அல்ல.',
  progress_decision_waiting_for_reviewer: 'உங்கள் கோரிக்கை ஒரு சரிபார்ப்பாளருக்காகக் காத்திருக்கிறது.',
  progress_decision_technical_issue:
    'முடிவு எடுக்கும் படியை முடிக்க முடியவில்லை. ஒரு சரிபார்ப்பாளர் உங்கள் கோரிக்கையைப் பார்ப்பார்.',
  progress_decision_needs_more_evidence: 'உங்கள் கோரிக்கைக்கு முடிவு எடுக்கக் கூடுதல் ஆதாரம் தேவை.',
  progress_decision_complete: 'உங்கள் கோரிக்கைக்கு முடிவு எடுக்கப்பட்டது.',
  progress_decision_claim_withdrawn: 'கோரிக்கை திரும்பப் பெறப்பட்டதால் முடிவு இல்லை.',

  action_submit_claim: 'உங்கள் கோரிக்கையைச் சமர்ப்பிக்கவும்',
  action_add_photos: 'சேதமடைந்த பயிரின் புகைப்படங்களைச் சேர்க்கவும்',
  action_upload_land_documents: 'நில ஆவணங்களைச் சேர்க்கவும்',
  action_resubmit_with_evidence: 'ஆதாரம் சேர்த்து மீண்டும் சமர்ப்பிக்கவும்',
  action_unknown: 'உங்களிடமிருந்து ஏதாவது தேவைப்படலாம்',
  actionBody_submit_claim:
    'உங்கள் கோரிக்கை சேமிக்கப்பட்டுள்ளது, ஆனால் சமர்ப்பிக்கப்படவில்லை. சமர்ப்பித்த பிறகு சோதனைகள் தொடங்கும்.',
  actionBody_add_photos: 'உங்கள் கோரிக்கையைச் சோதிக்கச் சேதத்தின் குறைந்தது ஒரு தெளிவான புகைப்படம் தேவை.',
  actionBody_upload_land_documents:
    'இந்த நிலத்துக்கான உங்கள் கோரிக்கை உரிமையை ஒரு சரிபார்ப்பாளர் உறுதிப்படுத்த நில ஆவணங்கள் உதவும்.',
  actionBody_resubmit_with_evidence:
    'விடுபட்ட புகைப்படங்கள் அல்லது ஆவணங்களைக் கீழே சேர்த்து, உங்கள் கோரிக்கை மீண்டும் சோதிக்கப்பட மீண்டும் சமர்ப்பிக்கவும்.',
  actionBody_unknown: 'என்ன தேவை என்பதைக் கீழே உள்ள பகுதிகளில் பாருங்கள்.',
  actionButton_add_photos: 'புகைப்படங்களைச் சேர்',
  actionButton_upload_land_documents: 'நில ஆவணங்களைச் சேர்',
  actionDocumentGroup: 'இவற்றில் ஏதேனும் ஒன்று: {{docs}}',
  actionAnyLandDocument: 'ஏதேனும் ஒரு நில ஆவணம்',
  actionSubmitFailedTitle: 'உங்கள் கோரிக்கை இன்னும் சமர்ப்பிக்கப்படவில்லை',

  // ── Claims list (my claims) ─────────────────────────────────────────────────────────────
  claimsPageSubtitle: 'நீங்கள் தாக்கல் செய்த ஒவ்வொரு கோரிக்கையும், அதன் தற்போதைய நிலையுடன்.',
  nextStep_submit: 'சோதனைகளைத் தொடங்க இந்தக் கோரிக்கையைச் சமர்ப்பிக்கவும்',
  nextStep_resubmit: 'கேட்கப்பட்ட ஆதாரத்தைச் சேர்த்து மீண்டும் சமர்ப்பிக்கவும்',
  nextStep_appeal: 'இந்த முடிவை மேல்முறையீடு செய்யலாம்',
  nextStepLabel: 'அடுத்த படி:',

  satelliteTitle: 'செயற்கைக்கோள் சோதனை',
  satelliteSupportingBadge: 'துணைத் தகவல் மட்டும்',
  satelliteSupportingNote:
    'செயற்கைக்கோள் படங்கள் துணைத் தகவல் மட்டுமே. அவை உங்கள் கோரிக்கையை ஒருபோதும் முடிவு செய்யாது; அவற்றால் மட்டும் சேதத்தை உறுதிப்படுத்தவும் முடியாது.',
  satelliteStatus_pending: 'இன்னும் சோதிக்கப்படவில்லை',
  satelliteStatus_processing: 'இப்போது சோதிக்கப்படுகிறது',
  satelliteStatus_passed: 'உங்கள் அறிக்கைக்கு ஆதரவாக உள்ளது',
  satelliteStatus_not_supported: 'இந்தப் பகுதிக்குக் கிடைக்காது',
  satelliteStatus_inconclusive: 'தெளிவான முடிவு இல்லை',
  satelliteStatus_unavailable: 'தற்போது கிடைக்கவில்லை',
  satelliteStatus_failed: 'முடிக்க முடியவில்லை (உங்கள் கோரிக்கையைப் பாதிக்காது)',
  satelliteStatus_unknown: 'நிலை கிடைக்கவில்லை',
  satelliteStatusExplain_pending: 'செயற்கைக்கோள் சோதனை இன்னும் நடைபெறவில்லை.',
  satelliteStatusExplain_processing: 'உங்கள் வயலின் செயற்கைக்கோள் படங்கள் சோதிக்கப்படுகின்றன.',
  satelliteStatusExplain_passed: 'செயற்கைக்கோள் படங்கள் உங்கள் அறிக்கையுடன் ஒத்துப்போகின்றன. இது துணைத் தகவல் மட்டுமே.',
  satelliteStatusExplain_not_supported: 'இந்தப் பகுதிக்குச் செயற்கைக்கோள் சோதனைகள் கிடைக்காது.',
  satelliteStatusExplain_inconclusive:
    'செயற்கைக்கோள் படங்களிலிருந்து தெளிவான பதில் கிடைக்கவில்லை. இது உங்களுக்கு எதிராகக் கணக்கிடப்படாது.',
  satelliteStatusExplain_unavailable:
    'செயற்கைக்கோள் சோதனை இப்போது கிடைக்கவில்லை. இது உங்கள் கோரிக்கையில் உள்ள பிரச்சனை அல்ல.',
  satelliteStatusExplain_failed: 'ஒரு தொழில்நுட்பச் சிக்கலால் செயற்கைக்கோள் சோதனை நின்றுவிட்டது. இது உங்கள் கோரிக்கையைப் பாதிக்காது.',
  satelliteStatusExplain_unknown: 'செயற்கைக்கோள் சோதனையின் நிலை இப்போது கிடைக்கவில்லை.',
  satelliteReason_waiting_for_post_event_imagery: 'நிகழ்வுக்குப் பிறகு எடுக்கப்பட்ட படங்கள் இன்னும் கிடைக்கவில்லை.',
  satelliteReason_queued: 'செயற்கைக்கோள் சோதனை தொடங்குவதற்காகக் காத்திருக்கிறது.',
  satelliteReason_not_started: 'செயற்கைக்கோள் சோதனை இன்னும் தொடங்கவில்லை.',
  satelliteReason_checking_imagery: 'செயற்கைக்கோள் படங்கள் சோதிக்கப்படுகின்றன.',
  satelliteReason_not_enabled: 'செயற்கைக்கோள் சோதனைகள் இயக்கப்படவில்லை.',
  satelliteReason_analysis_not_enabled: 'செயற்கைக்கோள் படங்கள் கிடைத்தன, ஆனால் தானியங்கிப் பகுப்பாய்வு இயக்கப்படவில்லை.',
  satelliteReason_provider_unavailable: 'செயற்கைக்கோள் சேவையை அணுக முடியவில்லை. இது உங்கள் கோரிக்கையில் உள்ள பிரச்சனை அல்ல.',
  satelliteReason_area_not_supported: 'இந்தப் பகுதிக்குச் செயற்கைக்கோள் சோதனைகள் கிடைக்காது.',
  satelliteReason_no_imagery_for_window: 'இந்தத் தேதிகளுக்குச் செயற்கைக்கோள் படங்கள் இல்லை.',
  satelliteReason_cloud_cover: 'படங்களில் உங்கள் வயலை மேகங்கள் மறைத்தன.',
  satelliteReason_not_enough_images: 'போதுமான தெளிவான படங்கள் இல்லை.',
  satelliteReason_analysis_inconclusive: 'படங்களிலிருந்து தெளிவான பதில் கிடைக்கவில்லை.',
  satelliteReason_vegetation_drop_consistent_with_damage:
    'நிகழ்வு நடந்த தேதியை ஒட்டிப் பசுமைப் பரப்பு குறைந்துள்ளது. இது துணைத் தகவல் மட்டுமே.',
  satelliteReason_no_clear_vegetation_change: 'பசுமைப் பரப்பில் தெளிவான மாற்றம் இல்லை. இது உங்களுக்கு எதிராகக் கணக்கிடப்படாது.',
  satelliteReason_technical_issue: 'ஒரு தொழில்நுட்பச் சிக்கலால் சோதனை நின்றுவிட்டது. இது உங்கள் கோரிக்கையைப் பாதிக்காது.',
  satelliteReason_claim_withdrawn: 'கோரிக்கை திரும்பப் பெறப்பட்டது.',
  satelliteNote_latest_check_failed:
    'புதிய செயற்கைக்கோள் சோதனையை முடிக்க முடியவில்லை; எனவே முந்தைய முடிவு காட்டப்படுகிறது.',
  satelliteWindowsTitle: 'பார்க்கப்பட்ட தேதிகள்',
  satelliteWindowBefore: 'நிகழ்வுக்கு முன்: {{start}} – {{end}}',
  satelliteWindowBeforeFrom: 'நிகழ்வுக்கு முன்: {{start}} முதல்',
  satelliteWindowAfterStarts: 'நிகழ்வுக்குப் பின்: {{start}} அன்று தொடங்கும்',
  satelliteWindowAfterCollecting: 'நிகழ்வுக்குப் பின்: {{start}} – இன்னும் படங்கள் சேகரிக்கப்படுகின்றன',
  satelliteWindowAfter: 'நிகழ்வுக்குப் பின்: {{start}} – {{end}}',
  satelliteImageryTitle: 'பயன்படுத்திய படங்கள்',
  satelliteImageryBefore: 'முன்: {{dates}}',
  satelliteImageryAfter: 'பின்: {{dates}}',
  satelliteImageryMore: 'மேலும் {{count}}',
  satelliteImageryNone: 'இல்லை',

  // ── Decision card ───────────────────────────────────────────────────────────────────────
  decisionReasonsTitle: 'காரணம்',
  decisionReason_timelinessCheck: 'நிகழ்வு தேதி 30 நாள் கோரிக்கைக் காலத்துக்கு வெளியே உள்ளது.',
  decisionReason_eventTypeCheck: 'இந்த வகை நிகழ்வுக்குக் கோரிக்கை செய்ய முடியாது.',
  decisionReason_areaCheck: 'கோரிய பரப்பு உங்கள் நிலப் பகுதிக்கு அனுமதிக்கப்பட்ட அளவை விட அதிகம்.',
  decisionReason_spatialCheck: 'கோரிய பரப்பு உங்கள் நிலப் பகுதியின் எல்லைக்கு வெளியே உள்ளது.',
  decisionReason_overlapCheck: 'கோரிய பரப்பு அதே நிலத்தில் உள்ள மற்றொரு கோரிக்கையுடன் ஒன்றிணைகிறது.',
  decisionReason_remainingCheck: 'கோரிய பரப்பு இந்த நிலப் பகுதியில் இன்னும் தகுதியுள்ள பரப்பை விட அதிகம்.',
  decisionReason_aiCheck_verified: 'புகைப்படச் சோதனை சேதத்தை உறுதிப்படுத்தவில்லை.',
  decisionReason_aiCheck_partially_verified: 'புகைப்படச் சோதனை சேதத்தை உறுதிப்படுத்தவில்லை.',
  decisionReason_aiCheck_rejected: 'புகைப்படங்களில் பயிர் சேதம் தெரியவில்லை.',
  decisionReason_aiCheck_out_of_limit: 'புகைப்படச் சோதனை சேதத்தை உறுதிப்படுத்தவில்லை.',
  decisionReason_aiCheck_duplicate_area: 'புகைப்படச் சோதனை சேதத்தை உறுதிப்படுத்தவில்லை.',
  decisionReason_aiCheck_more_evidence_required:
    'சேதத்தை உறுதிப்படுத்தப் புகைப்படங்கள் போதுமான அளவு தெளிவாக இல்லை. தெளிவான புகைப்படங்களைச் சேர்த்து மீண்டும் சமர்ப்பிக்கவும்.',
  decisionReason_aiCheck_unknown: 'புகைப்படச் சோதனை சேதத்தை உறுதிப்படுத்தவில்லை.',
  decisionReason_outcome_verified: 'அனைத்துச் சோதனைகளிலும் தேர்ச்சி பெற்றது.',
  decisionReason_outcome_partially_verified:
    'கோரிய பரப்பின் ஒரு பகுதி முந்தைய கோரிக்கையில் ஏற்கெனவே அடங்கியுள்ளது; மீதமுள்ள பகுதி ஏற்கப்பட்டது.',
  decisionReason_outcome_rejected: 'ஒப்புதலுக்கான விதிகளை இந்தக் கோரிக்கை பூர்த்தி செய்யவில்லை.',
  decisionReason_outcome_out_of_limit: 'கோரிய பரப்பு இன்னும் தகுதியுள்ள பரப்பை விட அதிகம்.',
  decisionReason_outcome_duplicate_area: 'இந்தப் பகுதி ஏற்கெனவே கோரப்பட்டு ஏற்கப்பட்டுள்ளது.',
  decisionReason_outcome_more_evidence_required: 'இந்தக் கோரிக்கைக்கு முடிவு எடுக்கக் கூடுதல் ஆதாரம் தேவை.',
  decisionReason_outcome_unknown: 'கீழே பட்டியலிடப்பட்ட சோதனைகளைப் பாருங்கள்.',
  decisionReason_reviewer: 'ஒரு சரிபார்ப்பாளர் உங்கள் கோரிக்கையைப் பார்த்து இந்த முடிவை எடுத்தார்.',
  decidedByReviewer: 'சரிபார்ப்பாளர்',
  claimRule_spatialCheck: 'உங்கள் நிலப் பகுதிக்குள்',
  claimRule_remainingCheck: 'மீதமுள்ள தகுதியான பரப்பு',
  claimRule_unknown: 'மற்ற சோதனை',
  approvedAreaTitle: 'ஏற்கப்பட்ட பரப்பு',
  overlapWarning_outside_parcel: 'வரைந்த பகுதி உங்கள் நிலப் பகுதியின் எல்லைக்கு வெளியே உள்ளது.',
  overlapWarning_overlaps_in_flight: 'வரைந்த பகுதி இன்னும் சோதிக்கப்படும் மற்றொரு கோரிக்கையுடன் ஒன்றிணைகிறது.',
  overlapWarning_overlaps_verified: 'வரைந்த பகுதி ஏற்கெனவே ஏற்கப்பட்ட ஒரு கோரிக்கையுடன் ஒன்றிணைகிறது.',
  overlapWarning_overlaps_verified_area:
    'வரைந்த பகுதி ஏற்கெனவே ஏற்கப்பட்ட ஒரு கோரிக்கையின் {{acres}} ஏக்கருடன் ஒன்றிணைகிறது.',
  overlapWarning_generic: 'வரைந்த பகுதி மற்றொரு கோரிக்கையுடன் ஒன்றிணைகிறது அல்லது உங்கள் நிலப் பகுதியைத் தாண்டுகிறது.',

  // ── Evidence on the claim page ──────────────────────────────────────────────────────────
  evidencePhotoAlt: 'கோரிக்கைப் புகைப்படம் {{n}}',
  evidenceDeleteItem: 'புகைப்படம் {{n}} ஐ அகற்று',
  evidenceDeleteBody: 'புகைப்படம் உங்கள் கோரிக்கையிலிருந்து அகற்றப்படும். பிறகு வேறொரு புகைப்படத்தைச் சேர்க்கலாம்.',
  evidenceSummaryTitle: 'உங்கள் ஆதாரங்கள்',
  evidenceSummaryPhotos: '{{count}} புகைப்படம்(ங்கள்)',
  evidenceSummaryDocuments: '{{count}} நில ஆவணம்(ங்கள்)',
  evidenceSummaryDocumentsLoading: 'நில ஆவணங்களை எண்ணுகிறோம்…',
  evidenceLinkPhotos: 'புகைப்படங்களுக்குச் செல்',
  evidenceLinkDocuments: 'நில ஆவணங்களுக்குச் செல்',
  evidenceLinkAppeal: 'மேல்முறையீட்டுக்குச் செல்',
  appealLoading: 'உங்கள் மேல்முறையீட்டை ஏற்றுகிறோம்…',

  // ── Admin: held claims and verification diagnostics (D8, D9) ────────────────────────────
  adminFilterHeld: 'நிறுத்திவைக்கப்பட்ட கோரிக்கைகள்',
  adminFilterHeldAny: 'நிறுத்திவைப்பு எதுவாயினும்',
  adminFilterHeldOnly: 'நிறுத்திவைக்கப்பட்டவை மட்டும்',
  adminFilterHeldExclude: 'நிறுத்திவைக்கப்படாதவை',
  adminSignalHeld: 'நிறுத்திவைப்பு',
  adminHeldNote:
    'நிறுத்திவைக்கப்பட்டது: இன்னும் முடிவு இல்லை; அமைப்பு ஒரு நபருக்காகக் காத்திருக்கிறது. "முடிவை மாற்று" மூலம் நீங்கள் முடிவு செய்யலாம்.',
  adminDiagTitle: 'சரிபார்ப்புக் கண்டறிதல்',
  adminDiagReadOnly: 'படிக்க மட்டும்',
  adminDiagLoadFailed: 'சரிபார்ப்புக் கண்டறிதல் தகவலை ஏற்ற முடியவில்லை.',
  adminDiagRound: 'சமர்ப்பிப்புச் சுற்று: {{round}}',
  adminDiagPolicy: 'கொள்கை: {{policy}}',
  adminDiagFarmerSees: 'விவசாயி பார்ப்பது: {{status}}',
  adminDiagJobs: 'பணிகள்',
  adminDiagNoJobs: 'சரிபார்ப்புப் பணிகள் இல்லை.',
  adminDiagColStep: 'படி',
  adminDiagColStatus: 'நிலை',
  adminDiagColAttempts: 'முயற்சிகள்',
  adminDiagColLastError: 'கடைசிப் பிழை',
  adminDiagColTimes: 'நேரங்கள்',
  adminDiagAttempts: '{{max}} இல் {{attempts}}',
  adminDiagNoError: 'எதுவும் இல்லை',
  adminDiagTime_runAt: 'நிர்ணயிக்கப்பட்ட நேரம்',
  adminDiagTime_startedAt: 'தொடங்கியது',
  adminDiagTime_completedAt: 'முடிந்தது',
  adminDiagTime_deadAt: 'கைவிடப்பட்டது',
  adminDiagTime_cancelledAt: 'ரத்து செய்யப்பட்டது',
  adminDiagReviewCases: 'மறுஆய்வு வழக்குகள்',
  adminDiagNoReviewCases: 'மறுஆய்வு வழக்குகள் இல்லை.',
  adminDiagEvidence: 'ஆதாரப் பதிவுகள்',
  adminDiagNoEvidence: 'ஆதாரப் பதிவுகள் இல்லை.',
  adminDiagAudit: 'தணிக்கைத் தடம்',
  adminDiagNoAudit: 'தணிக்கைப் பதிவுகள் இல்லை.',
};
