import re

with open("src/features/stories/index.jsx", "r", encoding="utf-8") as f:
    content = f.read()

# Remplacer folder: 'stories' par folder: 'posts' (qui est autorisé par l'API)
content = content.replace("folder: 'stories'", "folder: 'posts'")

# S'assurer qu'on utilise bien uploadExternalMedia
if "uploadToSupabase" in content:
    content = content.replace(
        "import { EngagementList } from '../../components/EngagementList.jsx';",
        "import { EngagementList } from '../../components/EngagementList.jsx';\nimport { uploadExternalMedia } from '../../lib/externalMedia.js';"
    )
    
    content = re.sub(
        r'const uploadToSupabase = async \(file\) \{.*?return publicUrl;\s*\};',
        '''const uploadMedia = async (file) => {
        const result = await uploadExternalMedia(file, {
          folder: 'posts',
          userId: id,
          maxBytes: 100 * 1024 * 1024,
        });
        return result.url;
      };''',
        content,
        flags=re.DOTALL
    )
    
    content = content.replace(
        "mediaUrl = await uploadToSupabase(mediaFile);",
        "mediaUrl = await uploadMedia(mediaFile);"
    )

with open("src/features/stories/index.jsx", "w", encoding="utf-8") as f:
    f.write(content)

print("✅ src/features/stories/index.jsx mis à jour")
print("✅ Utilise maintenant le dossier 'posts' (autorisé par l'API R2)")
print("🚀 Prêt à pousser !")
