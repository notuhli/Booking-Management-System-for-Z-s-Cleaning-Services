export const ADDRESS_DATA = {
  'Calbayog City': [
    'Acedillo','Aguit-itan','Alibaba','Amampacang','Anislag','Awang East','Awang West',
    'Ba-ay','Bagacay','Bagong Lipunan','Baja','Balud','Bante','Bantian','Basud','Bayo',
    'Begaho','Binaliw','Bontay','Buenavista','Bugtong','Cabacungan','Cabatuan','Cabicahan',
    'Cabugawan','Cacaransan','Cag-anahaw','Cag-anibong','Cagbanayacao','Cagbayang',
    'Cagbilwang','Cagboborac','Caglanipao Sur','Cagmanipes Norte','Cagmanipes Sur',
    'Cagnipa','Cag-olango','Cagsalaosao','Cahumpan','Calocnayan','Cangomaod','Canhumadac',
    'Capacuhan','Capoocan','Carayman','Carmen','Catabunan','Caybago','Central','Cogon',
    'Dagum','Danao I','Danao II','Dawo','De Victoria','Dinabongan','Dinagan','Dinawacan',
    'Esperanza','Gabay','Gadgaran','Gasdo','Geraga-an','Guimbaoyan Norte','Guimbaoyan Sur',
    'Guin-on','Hamorawon','Helino','Hibabngan','Hibatang','Higasaan','Himalandrog','Hindang',
    'Hiparayan','Hitapi-an','Hugon Rosales','Jacinto','Jimautan','Juangon','Kilikili',
    'La Paz','Lale','Limaong','Longsob','Lonoy','Mabini','Macatingog','Mag-ubay','Magallanes',
    'Malajog','Mancol','Mantacas','Marcelo','Mawacat','Maybog','Maysalong','Migara','Nabang',
    'Naga','Navarro','Nijaga','Obrero','Olera','Oquendo','Osmeña','Pag-asa','Palanas',
    'Panlayahan','Paraiso','Pasong','Payahan','Peña','Pinalanga','Pinamihagan','Quezon',
    'Rawis','Rizal','Ruperto Kangleon','Salvacion','San Isidro','San Joaquin','San Jose',
    'San Policarpo','San Rufino','Santo Niño','Saputan','Seguinon','Sinidman Occidental',
    'Sinidman Oriental','Tabawan','Talahid','Talamban','Tapa-e','Tigbao','Tinambacan Norte',
    'Tinambacan Sur','Tolingon','Tubod','Tulay','Tumalalod','Ubo','Victory',
  ],
  'Gandara': [
    'Adela Heights','Arong','Balocawe','Bangahon','Beslig','Buao','Bunyagan','Burabod I',
    'Burabod II','Calirocan','Canhumawid','Caparangasan','Caranas','Carmona','Casab-ahan',
    'Casandig','Catorse de Agosto','Caugbusan','Concepcion','Diaz','Dumalo-ong','Elcano',
    'Gerali','Gereganan','Giaboc','Hampton','Hetebac','Himamaloto','Hinayagan','Hinugacan',
    'Hiparayan','Jasminez','Lungib','Mabuhay','Macalpe','Magsaysay','Mahayahay','Malobago',
    'Mambog','Mercedes','Natividad','Nipa','Osmeña','Pag-asa','Palale','Palanit','Palanog',
    'Pinamonoan','Pinatulay','Poblacion','Rawis','Rizal','Roxas','Salvacion','San Andres',
    'San Fernando','San Francisco','San Isidro','San Jose','San Miguel','San Pablo',
    'San Pedro','San Vicente','Santa Cruz','Santo Niño','Silanga','Sugod','Tinaplacan','Tubig',
  ],
  'Sta. Margarita': [
    'Agrupacion','Arapison','Avelino','Bahay','Balud','Bana-ao','Burabod','Cagsumji',
    'Campeig','Camperito','Can-ipulan','Canmoros','Cautod','Cinco','Curry','Gajo','Hindang',
    'Ilo','Imelda','Inoraguiao','Jolacao','Lambao','Mabuhay','Mahayag','Matayonas','Monbon',
    'Nabulo','Napuro','Napuro II','Palale','Panabatan','Panaruan','Roxas','San Isidro',
    'Solsogon','Trinidad',
  ],
  'San Jorge': [
    'Anquiana','Aurora','Bay-ang','Blanca Aurora','Buenavista I','Buenavista II','Bulao',
    'Bungliw','Cabugao','Cag-olo-olo','Calundan','Cantaguic','Canyaki','Cogtoto-og','Erenas',
    'Gayondato','Guadalupe','Guindapunan','Hernandez','Himay','Janipon','La Paz','Libertad',
    'Lincoro','Mabuhay','Mancol','Matalud','Mobo-ob','Mombon','Puhagan','Quezon','Ranera',
    'Rawis','Rosalim','San Isidro','San Jorge I','San Jorge II','San Juan','San Pablo',
    'Sugod','Villareal',
  ],
};

export const MUNICIPALITIES = Object.keys(ADDRESS_DATA).sort();
export const getBarangays = (m) => ADDRESS_DATA[m] ? [...ADDRESS_DATA[m]].sort() : [];

// ── Barangays outside Calbayog City proper (transportation fee applies) ────────
// Admin: edit this list to add/remove barangays as needed.
// These are geographically distant from the city center (Tinambacan, coastal, mountain areas).
// ALL of Gandara, Sta. Margarita, and San Jorge also get the fee (separate municipalities).
export const OUTSIDE_PROPER_BARANGAYS = [
  // Tinambacan district
  'Tinambacan Norte', 'Tinambacan Sur',
  // Far northern/coastal barangays
  'Limaong', 'Longsob', 'Lonoy', 'Hamorawon', 'Carayman',
  // Far southern barangays
  'Tapa-e', 'Tigbao', 'Tabawan', 'Talahid', 'Talamban',
  // Remote inland barangays
  'Pinamihagan', 'Saputan', 'Tolingon', 'Tumalalod', 'Ubo',
  'Malajog', 'Cagboborac', 'Cag-olango',
  // Far eastern barangays
  'Monbon', 'Mancol', 'Lale', 'Kilikili',
];
