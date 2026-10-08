const { SlashCommandBuilder, REST, Routes } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('resim-ekle')
    .setDescription("Site üzerindeki gizli 'GIF & Resim Kasası' bölümüne bir fotoğraf veya GIF ekler.")
    .addAttachmentOption(opt => 
      opt.setName('dosya')
         .setDescription('Sitede arşivlenecek fotoğraf veya GIF dosyasını buraya yükleyin.')
         .setRequired(true))
    .addStringOption(opt => 
      opt.setName('baslik')
         .setDescription('Bu görselin web sitesinde görünecek başlığı veya açıklaması.')
         .setRequired(true))
    .addStringOption(opt => 
      opt.setName('kategori')
         .setDescription('Görsel kategorisi (Meme, Tepki, Fotoğraf, Komik, vb.)')
         .setRequired(false)),

  new SlashCommandBuilder()
    .setName('clip')
    .setDescription('Siteye belirli bir kategori ve başlıkla manuel bir video klip veya YouTube linki kaydeder.')
    .addStringOption(opt =>
      opt.setName('kategori')
         .setDescription('Klibin ait olduğu ana oyun/kategori.')
         .setRequired(true)
         .addChoices(
           { name: 'Valorant', value: 'Valorant' },
           { name: 'League of Legends', value: 'League of Legends' },
           { name: 'IRL', value: 'IRL' },
           { name: 'Meme', value: 'Meme' },
           { name: 'Diğer Oyunlar', value: 'Diğer Oyunlar' },
           { name: 'Genel', value: 'Genel' }
         ))
    .addStringOption(opt =>
      opt.setName('icerik')
         .setDescription('Klip bağlantısı (YouTube linki veya video URL)')
         .setRequired(false))
    .addAttachmentOption(opt =>
      opt.setName('dosya')
         .setDescription('Yüklenecek video dosyası (MP4 / MOV)')
         .setRequired(false))
    .addStringOption(opt =>
      opt.setName('baslik')
         .setDescription('Klip için başlık / bağlam metni.')
         .setRequired(false)),

  new SlashCommandBuilder()
    .setName('kategori-degistir')
    .setDescription('Yanlış kategorilenmiş bir klibin kategorisini günceller.')
    .addStringOption(opt =>
      opt.setName('mesaj_linki')
         .setDescription('Klibin Discord mesaj linki veya mesaj ID numarası.')
         .setRequired(true))
    .addStringOption(opt =>
      opt.setName('yeni_kategori')
         .setDescription('Klibe atanacak doğru kategori.')
         .setRequired(true)
         .addChoices(
           { name: 'Valorant', value: 'Valorant' },
           { name: 'League of Legends', value: 'League of Legends' },
           { name: 'IRL', value: 'IRL' },
           { name: 'Meme', value: 'Meme' },
           { name: 'Diğer Oyunlar', value: 'Diğer Oyunlar' },
           { name: 'Genel', value: 'Genel' }
         )),

  new SlashCommandBuilder()
    .setName('sync-gecmis')
    .setDescription('Kanalın geçmiş mesajlarını Discord kurallarına uygun yavaş hızda tarar ve klipleri kaydeder.')
    .addIntegerOption(opt =>
      opt.setName('adet')
         .setDescription('Taranacak maksimum mesaj sayısı (Varsayılan: 200).')
         .setRequired(false)),

  new SlashCommandBuilder()
    .setName('arsiv-durum')
    .setDescription('Sitede indekslenmiş toplam klip, resim ve kategori istatistiklerini gösterir.'),

  new SlashCommandBuilder()
    .setName('system')
    .setDescription('Çok sekmeli VPS telemetrisi (OS, 5 Domain, PM2, Docker, Pterodactyl) görüntüler. (Yalnızca @imbarb)'),

  new SlashCommandBuilder()
    .setName('media-stats')
    .setDescription('Aşık Vestel Medya Sunucusu (R2, Disk, Kullanıcılar) istatistiklerini görüntüler.'),

  new SlashCommandBuilder()
    .setName('soz-ekle')
    .setDescription('Sitedeki efsanevi sözler panosuna yeni bir söz ekler.')
    .addStringOption(opt =>
      opt.setName('soz')
         .setDescription('Eklemek istediğiniz efsanevi söz veya replik.')
         .setRequired(true))
    .addStringOption(opt =>
      opt.setName('yazar')
         .setDescription('Sözün sahibi veya rumuzu (örn: - Barb, - Çağatay).')
         .setRequired(true))
    .addUserOption(opt =>
      opt.setName('kisi')
         .setDescription('Sözün sahibi Discord üyesini etiketleyin (opsiyonel).')
         .setRequired(false)),

  new SlashCommandBuilder()
    .setName('feature')
    .setDescription('Özel site özelliklerinin erişim izinlerini yönetir. (Yalnızca Root Admin Barb)')
    .addSubcommand(sub =>
      sub.setName('grant')
         .setDescription('Bir kullanıcıya özellik erişim izni verir.')
         .addStringOption(opt =>
           opt.setName('ozellik')
              .setDescription('Erişim verilecek özellik.')
              .setRequired(true)
              .addChoices({ name: 'Spotify Wrapped Önizleme', value: 'wrapped' }))
         .addUserOption(opt =>
           opt.setName('kullanici')
              .setDescription('İzin verilecek Discord kullanıcısı.')
              .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('revoke')
         .setDescription('Bir kullanıcının özellik erişim iznini kaldırır.')
         .addStringOption(opt =>
           opt.setName('ozellik')
              .setDescription('Erişimi kaldırılacak özellik.')
              .setRequired(true)
              .addChoices({ name: 'Spotify Wrapped Önizleme', value: 'wrapped' }))
         .addUserOption(opt =>
           opt.setName('kullanici')
              .setDescription('İzni kaldırılacak Discord kullanıcısı.')
              .setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('list')
         .setDescription('Özellik erişimine sahip kullanıcıları listeler.')
         .addStringOption(opt =>
           opt.setName('ozellik')
              .setDescription('Listelenecek özellik.')
              .setRequired(true)
              .addChoices({ name: 'Spotify Wrapped Önizleme', value: 'wrapped' }))),

  new SlashCommandBuilder()
    .setName('oyun-ekle')
    .setDescription('Klip ayrıştırıcıya yeni bir oyun ve anahtar kelimeler ekler. (Yalnızca Root Admin Barb)')
    .addStringOption(opt =>
      opt.setName('oyun_adi')
         .setDescription('Oyunun adı (örn: Deadlock, Marvel Rivals).')
         .setRequired(true))
    .addStringOption(opt =>
      opt.setName('kategori')
         .setDescription('Oyunun atanacağı kategori.')
         .setRequired(true)
         .addChoices(
           { name: 'Valorant', value: 'Valorant' },
           { name: 'League of Legends', value: 'League of Legends' },
           { name: 'IRL', value: 'IRL' },
           { name: 'Meme', value: 'Meme' },
           { name: 'Diğer Oyunlar', value: 'Diğer Oyunlar' },
           { name: 'Genel', value: 'Genel' }
         ))
    .addStringOption(opt =>
      opt.setName('anahtar_kelimeler')
         .setDescription('Virgülle ayrılmış anahtar kelimeler (örn: deadlock, patron, urn).')
         .setRequired(true))
    .addStringOption(opt =>
      opt.setName('etiketler')
         .setDescription('Virgülle ayrılmış kısa etiketler (örn: deadlock, dl).')
         .setRequired(false))
];

async function deploySlashCommands(config, targetGuildId = null) {
  if (!config.BOT_TOKEN || !config.CLIENT_ID) {
    console.warn('[Bot] Bot credentials incomplete. Skipping slash command registration.');
    return;
  }
  const guildsToDeploy = targetGuildId
    ? [targetGuildId]
    : ((config.GUILD_IDS && config.GUILD_IDS.length > 0) ? config.GUILD_IDS : [config.GUILD_ID].filter(Boolean));

  if (guildsToDeploy.length === 0) {
    console.warn('[Bot] No guild IDs configured. Skipping slash command registration.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(config.BOT_TOKEN);
  for (const guildId of guildsToDeploy) {
    try {
      console.log(`[Bot] Registering slash commands for guild ${guildId}...`);
      await rest.put(
        Routes.applicationGuildCommands(config.CLIENT_ID, guildId),
        { body: commands.map(c => c.toJSON()) }
      );
      console.log(`[Bot] Slash commands successfully registered for guild ${guildId}!`);
    } catch (err) {
      console.error(`[Bot] Failed to register slash commands for guild ${guildId}:`, err.message);
    }
  }
}

module.exports = { deploySlashCommands, commands };
