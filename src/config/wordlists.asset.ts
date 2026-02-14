/**
 * config/wordlists.asset.ts - Pre-generated entropy wordlists.
 * 10 complete verb-noun pair lists (50 pairs each) for use when:
 *   - LLM is unavailable or slow (TPS below threshold)
 *   - Running in test/CI mode
 *   - sessionStorage cache is empty and LLM hasn't responded yet
 *
 * Generated offline from BitNet; bundled as static game assets.
 * At startup, one list is selected randomly (or scrambled for variance).
 * TODO: DOC - regeneration process for updating these wordlists
 */

export const BUNDLED_WORDLISTS: readonly string[][] = [
  // Wordlist 0 — "Cosmic Absurdity"
  [
    'obliterate quasar', 'fabricate nebula', 'concatenate whirlpool',
    'disintegrate mammoth', 'evaporate thunderclap', 'illuminate spaghetti',
    'transfigure rhinoceros', 'amalgamate kaleidoscope', 'perpetuate dragonfly',
    'crystallize earthquake', 'defenestrate porcupine', 'extrapolate marshmallow',
    'hallucinate spacecraft', 'metamorphose blueberry', 'procrastinate avalanche',
    'recalibrate dinosaur', 'teleportate watermelon', 'ventriloquize telescope',
    'circumnavigate jellyfish', 'deconstruct harmonica', 'extemporize flamingo',
    'hyperbolize snorkeling', 'incapacitate bubblegum', 'juxtaposing catapult',
    'legitimatize rollercoaster', 'miniaturize trampoline', 'obliterating chandelier',
    'procrastinate fireworks', 'resuscitating labyrinth', 'sophisticate pineapple',
    'orchestrating marmalade', 'decompartment spaceship', 'interstellar honeycomb',
    'electrifying mushroom', 'unscrambling fishstick', 'hallucinated bumblebee',
    'reconstitute xylophone', 'discombobulate pigeonhole', 'serendipitous thunderbolt',
    'phantasmagoric sombrero', 'discombobulate hamburger', 'transcontinental penguin',
    'electromagical dandelion', 'recombobulate avalanche', 'phosphorescent butterfly',
    'discombobulate lampshade', 'quintessential cucumber', 'phantasmagoric jellybean',
    'anthropomorphize starfish', 'uncharacteristic bluebird',
  ],
  // Wordlist 1 — "Dimensional Nonsense"
  [
    'vaporize chandelier', 'encapsulate thunderfish', 'galvanize archipelago',
    'perpetuate cataclysm', 'magnetize butterscotch', 'triangulate marsupial',
    'disseminate peppercorn', 'extrapolate flambe', 'hypothesize dragonboat',
    'recapitulate microscope', 'bamboozlement firehose', 'defragmenting parsnip',
    'incandescent trampoline', 'consolidate honeybadger', 'circumscribe blunderbuss',
    'electrocuting jellyroll', 'disemboweling crocodile', 'particulate snowflake',
    'infinitesimal zeppeling', 'destabilize greenhouse', 'hallucinating pineapple',
    'transubstantiate coconut', 'overpopulate clocktower', 'hyperventilate mushroom',
    'reinstituting grasshopper', 'catastrophize waterslide', 'interpolation fingernail',
    'oversimplified spacecraft', 'dematerializing submarine', 'counterbalance stalagmite',
    'decontaminate windowpane', 'superimposing fishmonger', 'decentralized peppermint',
    'metamorphosing chessboard', 'perambulating watermelon', 'rehabilitating centipede',
    'disintegrating peppercorn', 'misrepresent bouillabaisse', 'oversimplified toothbrush',
    'reconstituting cornucopia', 'miscommunicate armadillo', 'overcompensate chrysanthemum',
    'underestimated palindrome', 'transmogrified hedgehog', 'disorganizating cuttlefish',
    'counterproductive iguana', 'indistinguishable platypus', 'unprecedenteded octopus',
    'disproportionate jellyfish', 'incomprehensible aardvark',
  ],
  // Wordlist 2 — "Quantum Kitchen"
  [
    'caramelize graviton', 'fermentating telescope', 'defrosting constellation',
    'marinating tachometer', 'braising perpendicular', 'basting thermometer',
    'sauteing seismograph', 'blanching cryptocurrency', 'bruleing circumference',
    'deglacifying observatory', 'flambeeing metamorphosis', 'poachinating observatory',
    'reducinating parallelepiped', 'simmering bureaucracy', 'steampunking cauliflower',
    'broilering kaleidoscope', 'filetting catastrophe', 'gratinating pseudoscience',
    'infusingized stratosphere', 'julienning trampoline', 'kneadifying constellation',
    'leavening dichotomous', 'macerating thermodynamic', 'parboiling onomatopoeia',
    'proofinating spectroscopy', 'rendering bibliography', 'scorchifying xylophone',
    'tempering bibliography', 'truffleized philanthropy', 'whiskifying trampoline',
    'zestinating kaleidoscope', 'brininating infrastructure', 'clarifaying palindrome',
    'drizzlifying supercalifrag', 'emulsifyzing thunderstorm', 'fondueifying hummingbird',
    'glazzinating rollercoaster', 'herbifying caterpillar', 'icyfrosting waterwheel',
    'jackhammering asparagus', 'kettleizing marshmallow', 'ladlifying trampoline',
    'minceifying architecture', 'nutmegizing harmonica', 'overfrying catastrophe',
    'peppermilling astronomy', 'quickfrying trampoline', 'roastifying dandelion',
    'smokeifying honeybadger', 'tenderizing whippoorwill',
  ],
  // Wordlist 3 — "Botanical Machinery"
  [
    'photosynthesizing crankshaft', 'germinating transmission', 'pollinating compressor',
    'hybridizing thermocouple', 'cultivating oscilloscope', 'prunerizing accelerometer',
    'transplanting gyroscoping', 'propagation alternator', 'mulcherizing servomotor',
    'compostering barometric', 'leafblowing spectrometer', 'rootgrinding telescoping',
    'branchifying centrifugal', 'seedscatter transistoring', 'flowerpress hydraulicing',
    'vinetraining differential', 'hedgetrimming potentiometer', 'grasscutting carburetor',
    'weedwacking seismometer', 'treetopping chronometer', 'barkpeeling dynamometer',
    'sapextract voltmeter', 'blossompick anemometer', 'budgrafting speedometer',
    'canopyshape thermometer', 'deadheading tachycardia', 'espaliering transformer',
    'fertilizing inclinometer', 'greenhousing densitometer', 'humusmaking accelerator',
    'irrigating magnetometer', 'jiggerprune thermostat', 'knotpruning odontometer',
    'layerbranch turbocharger', 'mossremoving calorimeter', 'nutcollect photovoltaic',
    'orchardfarm galvanometer', 'peatmossharvest micrometer', 'quickgrowth respirometer',
    'rootdivide viscosimeter', 'soilrotate electrometer', 'tendrilwrap tensiometer',
    'undergrowth spectrograph', 'vegetatelife psychrometer', 'waterspray barothermograph',
    'xylemtransport hygrometer', 'yieldoptimize chronograph', 'zonerotating pyrheliometer',
    'aeratecompost dosimeter', 'biogrowth interferometer',
  ],
  // Wordlist 4 — "Submarine Orchestra"
  [
    'orchestrating bathysphere', 'harmonizing submersible', 'conducting aqualunging',
    'compositing depthcharge', 'crescendoing periscoping', 'diminuendoed portholing',
    'fortissimoed torpedoing', 'glissandoing propelling', 'improvisated sonarscope',
    'syncopating hydrophone', 'arpeggiating barometer', 'cantilever pressurevalve',
    'dissonanting navigation', 'enharmonized oceanfloor', 'fermatahold deepseatrench',
    'grandiosified submarine', 'hemidemisemi buoyancifix', 'interluding periscoping',
    'jubilanting aquanauting', 'keynoteshift hydroscoping', 'larghettoize underwaterval',
    'marcatoblast torpedotubing', 'notatesharply depthgauging', 'octaveshift submarinebell',
    'pizzicatoing deepseafish', 'quarternotize divingbellas', 'restholding underwaterlamp',
    'sforzandoing submergence', 'tremoloshift bathythermograph', 'unisonfloat pressurelock',
    'vibratoshift submarinedivez', 'wholetoneshift profundity', 'xylophoneplay sonarscreen',
    'yodelundersea depthfinding', 'zitherplaying waterpressure', 'allegronotes bathymetrics',
    'brillanteplay compassneedle', 'cadenzashift pressuregage', 'dolceundersea aqualunger',
    'espressivedo hydrolocation', 'fugalpattern submergiblexx', 'graziosoblast periscopelens',
    'halfnotering depthsounder', 'incisivesound whalecalling', 'jovialplaying underwatermic',
    'kanteleshift anticycloning', 'legatoshifted submarinegate', 'maestosoplay periscoperaise',
    'naturalshift underwaterhorn', 'obertonshift divebellsound',
  ],
  // Wordlist 5 — "Prehistoric Internet"
  [
    'downloadable brontosaurus', 'uploadifying pterodactyl', 'streamlining triceratops',
    'bufferinaddo stegosaurying', 'cachipulating tyrannosaurus', 'debugginating apatosaurus',
    'encryptified velociraptor', 'firewallzing dilophosaurus', 'gatewayshift pachycephalon',
    'hashtagizing ankylosauring', 'indexinating ichthyosaurus', 'javascripted megalosaurus',
    'keyloggering parasaurolophus', 'loadbalanced spinosaurusing', 'malwareblock brachiosaurus',
    'networkshift therizinosaurus', 'overclocking deinonycharge', 'pingsweeping oviraptoring',
    'querystacked compsognathus', 'routerflash australopith', 'serversocket dimetrodoning',
    'threadlocked edmontosaurus', 'urlredirected giganotosaurus', 'voipconnect hadrosauring',
    'webscrapingd iguanodontide', 'xmlparsified jurassicpark', 'yieldawaitin kentrosaurus',
    'ziparchiving lambeosaurus', 'apigatewayed mosasaurusing', 'bytecounting nothosauride',
    'cloudhosting ornithomimusd', 'datastacking plesiosaured', 'edgecomputed quetzalcoatlus',
    'fiberopticod rhamphorhynchus', 'graphquering saurornithoid', 'httplistener torvosaurusing',
    'ipv6switched utahraptoring', 'jsonparsified vulcanodontid', 'kubedeployed wuerhosaurused',
    'latencycheck xenoceratopsd', 'mongoinserted yangchuanosaurus', 'nodeclustered zuniceratopsed',
    'oauth2signed allosaurusify', 'patchrequest baryonyxforced', 'ratelimiting carnotaurusing',
    'sslcertified dracorexbuilt', 'tcphandshake elasmosaurized', 'udpbroadcast frameosaurusxx',
  ],
  // Wordlist 6 — "Meteorological Furniture"
  [
    'upholstering thunderstorm', 'reupholstered cloudbursted', 'cushioncraft precipitation',
    'fabricweaving cyclonefront', 'laminatepress frontalsystem', 'polishfinish hailstonefall',
    'sandblasting icestomsurge', 'varnishcoated jetstreaming', 'woodturned meteorological',
    'dovetailjoined nimbostratus', 'mortisetenon cumulonimbus', 'rabbetjoint stratocumulus',
    'biscuitjoint cirrostratus', 'fingerjointed altostratus', 'halflapdoing altocumulus',
    'mitrecutting cirrocumulus', 'dadogrooved barometrical', 'tonguegroove hygrometric',
    'scrollsawing anemometric', 'bandlawcut thermographic', 'jigsawpuzzle pluviometric',
    'circularsawn isothermaled', 'tablesawncut isobaricnode', 'routerplaned frontolysised',
    'planerknifed anticycloned', 'drillpressed microburstion', 'lathespindled precipitable',
    'spokeshaveed dewpointrise', 'chiselcarved frostbitezon', 'adzeflattened windchillfact',
    'drawknifepull heatindexing', 'frostshoaved humidexrated', 'bracedrill tropospherical',
    'augerbored stratospheric', 'clamptightened mesosphering', 'visecompressed thermomapped',
    'workbenched barothermally', 'sawhorsebuilt clinometric', 'levelchecked hypsometriced',
    'squareruled psychrometerd', 'chalklined astroclimate', 'miterboxcut evapotranspird',
    'pipeclampfid condensation', 'cornclampset sublimational', 'springclampd advectionfogg',
    'toggleclampt radiationfogd', 'cantileverbd persistentfog', 'buttjointzed microclimated',
    'scarfjointd mesoclimatezd', 'lappointseal macroclimatex',
  ],
  // Wordlist 7 — "Geological Pastry"
  [
    'crystallizing croissanting', 'sedimentating cinnabunroll', 'metamorphosed danishipastry',
    'stratificated baklavasheet', 'fossilizating eclairfilling', 'geomorphized muffintoprise',
    'tectonicsift puffpastrylay', 'erosioncarve strudelfilling', 'depositation briochedough',
    'lithificating churrocrisp', 'diagenetical croquebreaded', 'petrological galettecrusted',
    'mineralogize kougnoamannd', 'volcanologic panbriocherise', 'seismological sfogliateeled',
    'paleontified beignetdozed', 'stratigraphy caneleformed', 'geochemistry kolachemolded',
    'geophysicist macaronshells', 'hydrogeology madeleinecake',
    'geotechnical millefeuilled', 'thedolitesurv napoleonslice',
    'bathyrmetric operatortzxxx', 'gravimetrical palmierecrisp',
    'magnetometry profiteroles', 'radiometrics religieusecak',
    'spectrometry rugelachwrap', 'reflectioned sablecookiexd',
    'seismometry tartletshells', 'telemetriced tuilecoookied',
    'inclinometry vatrouchkaxd', 'accelerating wafflebatters',
    'pyroclasting xuixoslicexd', 'volcanoclast yearstwisted',
    'effusiveflow zeppolefried', 'intrusiverock applestrudel',
    'pyroclastics bearclawpull', 'lavafountain cannolifilled',
    'phreatomagma donutglazeed', 'strombolianxx eclairganzed',
    'vulcanianblast fritterfried', 'peleeanblastd galettecrusts',
    'plinianblastr honeybunrise', 'sultrablaster iceringdonut',
    'hawaiianblast jellyrolling', 'subpliniander kolachefilled',
    'ultraplinianer laugabrothed', 'effusiveerupt macaronstack',
    'explosiveerupt napoleonrise', 'hydrovulcanic operacakelay',
  ],
  // Wordlist 8 — "Oceanic Arithmetic"
  [
    'calculating tsunamiwave', 'subtractified maelstromwind', 'multiplication tidepool',
    'dividendshift riptideflow', 'factorialwave undertowpull', 'logarithmswell neaptiderise',
    'exponentialed springtided', 'integratedwave stormssurged',
    'differentials swellperiods', 'polynomialize breakerfoams',
    'trigonometric whitecapping', 'algebraizable harborcalmed',
    'statisticized seabreezeblw', 'probabilistic choppywatered',
    'geometricized groundswells', 'arithmeticsea roguewaversd',
    'calculusdrift longshoreflow', 'equationaire underwatercur',
    'inequalitysurf upwellingggg', 'variablecurrent crossseaddd',
    'constantswell internaltide', 'coefficientdip seichemotioned',
    'matrixrotated eddycurrented', 'vectorialwave gyrerotation',
    'eigenvaluefor convergencez', 'determinantal divergencezn',
    'permutational coriollisxxx', 'combinatorial ekmanspiraln',
    'convergentsea langmuircell', 'divergentswell thermalocean',
    'asymptotewave haloclinetip', 'derivativeebb pycnoclinezn',
    'antisymmetric thermoclined', 'bilinearflow mesoscaleeddy',
    'covariantdrift submesoscale', 'contravariant barocliniced',
    'tensorialwave barotropicfl', 'pseudoscalard geostrophicd',
    'quaterniondip cyclostrophd', 'hypercomplex inertialoscil',
    'transcendence tidalborechg', 'irrationaltide solitonwaved',
    'imaginaryswell tsunamigenic', 'complexnumber meteotsunami',
    'realnumbersea seichemotions', 'naturalnumber coasttrapped',
    'primenumbertd shelfwavemod', 'perfectnumber kelvinwavezz',
    'amicablenumbs rossbywavezz', 'abundantnumbs equatorialwv',
  ],
  // Wordlist 9 — "Entomological Jazz"
  [
    'improvisating silkwormglow', 'bebopsinging cicadarhythms', 'swingtimewith fireflydance',
    'bluesscaling butterflying', 'ragtimedoing dragonflyzoom', 'cooljazbuzzd ladybugswing',
    'bigbandhummd beetlemarched', 'fusiongroovd caterpillarbp', 'smoothjazzed mothflutterr',
    'acidiazzbuzd grasshopperr', 'afroCubanjam cricketschirp', 'avantgardeed waspstinging',
    'bossaNovafly antmarchband', 'chamberjazzed termitedrumm', 'dixielandfly mantisprayerr',
    'ethiojazzfly aphidcrawlzz', 'freeformjazz earwigpinchzz', 'gypsjybuzzzz fleahopbound',
    'hardbopflyzz gnatswarmddd', 'indojazzbuzz hornetdiveem', 'jiveswingfly mayflyflashh',
    'klezmerswing mosquitohummm', 'latinjazzzzz pillbugespin', 'modaljazzzzz scorpionwalkk',
    'nujazzbuzzed silkwormweave', 'orchestralzz spiderhanggg', 'postbopflyed stinkbugsmell',
    'quietstormzz tickcrawlzzz', 'rebopflybuzz wasphoverzzz', 'souljazzzzed weevileating',
    'thirdstreamm yellowjacket', 'uptempobuzzz zebrabutterfl', 'vocalezzzing ambrosiabeetl',
    'westcoastjaz boxelderbugz', 'xenogroovzzz chiggerbitezz', 'youthfuljazz damselflyzoom',
    'zenojazzflow emeraldashbor', 'acidhousebug figureeightmot', 'breakbeatbug geometermothh',
    'chillhopzzzz hawkmothoverr', 'downtempobug inchworminchh', 'electrobeatbug junebugflyzz',
    'funkbeatbuzd katydidbuzzed', 'glitchhopbugz lacewingflzzz', 'housandbugzzz locustswarmzz',
    'industrialbug midgecloudzz', 'jumpupbugzzz noctuidmothfl', 'knumbugbuzzed oakwormcrawlz',
    'liquidbugzzz plumemothrise', 'minimalbugzzz queenbeeflyzz',
  ],
] as const;

/**
 * Select a random bundled wordlist and scramble it.
 * Uses Fisher-Yates shuffle for uniform randomness.
 * @param seed Optional numeric seed for deterministic selection
 */
export function getScrambledWordlist(seed?: number): string[] {
  const idx = seed !== undefined
    ? Math.abs(seed) % BUNDLED_WORDLISTS.length
    : Math.floor(Math.random() * BUNDLED_WORDLISTS.length);
  const list = [...BUNDLED_WORDLISTS[idx]];

  // Fisher-Yates shuffle
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
