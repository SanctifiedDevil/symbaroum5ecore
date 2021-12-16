import { COMMON } from '../common.js'
import { logger } from '../logger.js';

export class SheetCommon {

  /** SETUP **/
  static register() {
    this.patch();
    this.globals();
  }

  static patch() {
    this._patchActor();
  }

  static _patchActor() {

    COMMON.CLASSES.Actor5e.prototype.getCorruption = function() {
      let corruption = this.getFlag(COMMON.DATA.name, SheetCommon.FLAGS.corruption) ?? SheetCommon.DEFAULT_FLAGS[SheetCommon.FLAGS.corruption]
      
      corruption.value = corruption.temp + corruption.permanent;
      
      return corruption;
    };

    COMMON.CLASSES.Actor5e.prototype.setCorruption = async function ({temp, permanent, max}) {
      const corruption = Object.assign(this.getCorruption(), {temp, permanent, max});
      await this.setFlag(COMMON.DATA.name, SheetCommon.FLAGS.corruption, corruption);
      return;
    }

    COMMON.CLASSES.Actor5e.prototype.getShadow = function() {
      const shadow = this.getFlag(COMMON.DATA.name, SheetCommon.FLAGS.shadow) ?? SheetCommon.DEFAULT_FLAGS[SheetCommon.FLAGS.shadow];
      return shadow;
    }

    COMMON.CLASSES.Actor5e.prototype.getManner = function() {
      const shadow = this.getFlag(COMMON.DATA.name, SheetCommon.FLAGS.manner) ?? SheetCommon.DEFAULT_FLAGS[SheetCommon.FLAGS.manner];
      return shadow;
    }
  }

  static globals() {
    game.syb5e.debug.initActor = this.reInitActor
  }

  /** \SETUP **/

  /** DEFAULT DATA AND PATHS **/
  static get FLAGS() {
    return {
      initialized: 'initialized',
      corruption: 'corruption',
      manner: 'manner',
      shadow: 'shadow'
    }
  }

  static get DEFAULT_FLAGS() {
    return {
      [COMMON.DATA.name]: {
        [this.FLAGS.initialized]: true,
        [this.FLAGS.corruption]: {
            temp: 0,
            permanent: 0,
            value: 0,
            max: 0
        },
        [this.FLAGS.manner]: '',
        [this.FLAGS.shadow]: '',
      }
    }
  }

  static get SYB5E_PATHS() {
    const root = `flags.${COMMON.DATA.name}`;
    return {
      [this.FLAGS.initialized]: `${root}.${this.FLAGS.initialized}`,
      [this.FLAGS.corruption]: {
        temp: `${root}.${this.FLAGS.corruption}.temp`,
        permanent: `${root}.${this.FLAGS.corruption}.permanent`,
        value: undefined, //getter only
        max: `${root}.${this.FLAGS.corruption}.max`
      },
      [this.FLAGS.manner]: `${root}.${this.FLAGS.manner}`,
      [this.FLAGS.shadow]: `${root}.${this.FLAGS.shadow}`
    }
  }

  static defaults(sheetClass) {
    sheetClass['NAME'] = sheetClass.name;

    COMMON[sheetClass.NAME] = {
      scope: 'dnd5e',
      sheetClass,
    }

    /* need to use our own defaults to set our defaults */
    COMMON[sheetClass.NAME].id = `${COMMON[sheetClass.NAME].scope}.${COMMON[sheetClass.NAME].sheetClass.name}`
  }

  /** \DEFAULTS **/

  /** SYB DATA SETUP **/

  /* @param actor : actor document to initialize
   * @param overwrite : force default values regardless of current flag data
   */
  static _flagInitData(actor, overwrite = false) {

    /* get the default flag data */
    let defaultFlagData = SheetCommon.DEFAULT_FLAGS;

    /* calculate the initial corruption threshold */
    defaultFlagData[COMMON.DATA.name][SheetCommon.FLAGS.corruption].max = SheetCommon._calcMaxCorruption(actor);

    /* if overwriting, force our default values, otherwise merge our new flag data into the actor's flags */
    const initializedFlags = overwrite ? defaultFlagData : mergeObject(actor.data.flags, defaultFlagData, {inplace: false});
    logger.debug(`Initializing ${actor.name} with default syb data:`, initializedFlags);

    return initializedFlags;
  }

  /* Initializes SYB5E-specific data if this actor has not been initialized before */
  static _initFlagData(actor, updateData) {
    
    /* check if we have already been initialized */
    const needsInit = !(actor.getFlag(COMMON.DATA.name, SheetCommon.FLAGS.initialized) ?? false)
    logger.debug(`${actor.name} needs syb init:`, needsInit);
    
    if (needsInit) {

      /* gracefully merge */
      const initializedFlags = SheetCommon._flagInitData(actor, false);

      mergeObject(updateData.flags, initializedFlags);
    }
  }

  static async reInitActor(actor, overwrite) {
    const initializedFlags = SheetCommon._flagInitData(actor, overwrite);
    
    /* clear out any old data */
    await actor.update({[`flags.-=${COMMON.DATA.name}`]: null});

    /* set our default data */
    await actor.update({flags: initializedFlags});

    return actor.data.flags[COMMON.DATA.name];
  }

  /** \SYB DATA SETUP **/ 

  /** COMMON SHEET OPS **/ 

  /* Common context data between characters and NPCs */
  static _getCommonData(actor) {

    /* Add in our corruption values in 'data.attributes' */
    return {
      sybPaths: SheetCommon.SYB5E_PATHS,
      data: {
        attributes: {
          corruption: actor.getCorruption()
        },
        details: {
          shadow: actor.getShadow()
        }
      }
    }
  }

  /** \COMMON **/

  /** HOOKS **/

  /* ensures we have the data needed for the symbaroum system when
   * the SYB sheet is chosen for the first time
   */
  static _preUpdateActor(actor, updateData /*, options, user */) {

    const sheetClass = COMMON[this.NAME].id;

    if (getProperty(updateData, 'flags.core.sheetClass') == sheetClass) {

      /* we are updating to OUR sheet. Ensure that we have the flag
       * data initialized
       */
      SheetCommon._initFlagData(actor, updateData);
    }

  }

  /** \HOOKS **/

  static commonListeners(html) {
    
  }

  /** MECHANICS HELPERS **/

  /* Corruption Threshold = (prof * 2) + charisma mod; minimum 2
   * Source: PGpg37
   */
  static _calcMaxCorruption(actor) {
    const prof = actor.data.data.prof.flat; 
    const chaMod = actor.data.data.abilities.cha.mod;

    return Math.max( chaMod + prof * 2, 2 );
  }

  /** \MECHANICS HELPERS **/
}

export class Syb5eActorSheetCharacter extends COMMON.CLASSES.ActorSheet5eCharacter {

  static register(){
    this.defaults();

    logger.info(COMMON.localize('SYB5E.Init.SubModule', {name: this.NAME}));

    /* register our sheet */ 
    Actors.registerSheet(COMMON[this.NAME].scope, COMMON[this.NAME].sheetClass, {
      types: ['character'],
      makeDefault: true,
      label: COMMON.localize('SYB5E.Sheet.Character.Label'),
    });

    this.hooks();
  }


  static defaults() {
    SheetCommon.defaults(this); 
  }

  static hooks() {
    Hooks.on('preUpdateActor', SheetCommon._preUpdateActor.bind(this));
  }

  /** OVERRIDES **/
  activateListeners(html) {
    super.activateListeners(html);

    SheetCommon.commonListeners.bind(this,html)();
  }

  //TODO expand to other modes (like limited)
  get template() {
    return `${COMMON.DATA.path}/templates/actors/syb5e-character-sheet.html`
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["syb5e", "dnd5e", "sheet", "actor", "character"],
      //width: 720,
      //height: 680
    });
  }

  getData() {
    let context = super.getData();

    mergeObject(context, SheetCommon._getCommonData(this.actor));
    logger.debug('getData#context:', context);
    return context;
  }
}

export class Syb5eActorSheetNPC extends COMMON.CLASSES.ActorSheet5eNPC {

  static register(){
    this.defaults();

    logger.info(COMMON.localize('SYB5E.Init.SubModule', {name: this.NAME}));

    /* register our sheet */ 
    Actors.registerSheet("dnd5e", Syb5eActorSheetNPC, {
      types: ['npc'],
      makeDefault: true,
      label: COMMON.localize('SYB5E.Sheet.NPC.Label'),
    });

    this.hooks();
  }
  

  static defaults() {
    SheetCommon.defaults(this);
  }

  static hooks() {
    Hooks.on('preUpdateActor', SheetCommon._preUpdateActor.bind(this));
  }

  static _getNpcData(actor) {
    return {
      data: {
        details: {
          manner: actor.getManner()
        }
      }
    }
  }

  /** OVERRIDES **/
  activateListeners(html) {
    super.activateListeners(html);

    SheetCommon.commonListeners.bind(this,html)();
  }

  //TODO expand to other modes (like limited)
  get template() {
    return `${COMMON.DATA.path}/templates/actors/syb5e-npc-sheet.html`
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      classes: ["syb5e", "dnd5e", "sheet", "actor", "npc"],
      //width: 720,
      //height: 680
    });
  }

  getData() {
    let context = super.getData();
    mergeObject(context, SheetCommon._getCommonData(this.actor));

    /* NPCs also have a small 'manner' field describing how they generally act */
    mergeObject(context, Syb5eActorSheetNPC._getNpcData(this.actor));

    logger.debug('getData#context:', context);
    return context;
  }
}
