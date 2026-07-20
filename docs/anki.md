# Anki Integration

ylang exports learned items through AnkiConnect on the local machine.

## Requirements

1. Install Anki.
2. Install the AnkiConnect add-on.
3. Start Anki before pressing the ylang export button.

If Anki or AnkiConnect is not running, ylang cannot sync cards. The export UI should report that it is waiting for or unable to reach AnkiConnect.

## Card Behavior

ylang creates a custom note type and stores stable ylang IDs in card fields. On later exports it should:

- skip unchanged notes,
- update existing notes when text, translation, notes, or media fields changed,
- store the returned Anki note ID locally,
- recreate a note if the stored note ID no longer exists in Anki.

Deleting a learned item in ylang does not delete the corresponding Anki note. Current sync is intentionally create/update/recreate/skip only, not deletion mirroring.

## Deck Names

The main setting is an Anki deck prefix. ylang creates language-specific deck names from that prefix, for example:

```text
ylang - German
ylang - French
```

The implementation is intentionally shaped so later versions can add custom suffixes per target language instead of always using the default language name.

## Media

Screenshot and audio-snippet capture are disabled in the current alpha because browser and player support has not been reliable enough. Existing local media attachments from older test builds can still be deleted from Learned Items and may still be exported if present.
