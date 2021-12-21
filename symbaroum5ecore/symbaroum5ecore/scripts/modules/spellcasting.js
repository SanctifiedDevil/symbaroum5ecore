import { COMMON } from '../common.js'
import { logger } from '../logger.js';
import { SYB5E } from '../config.js'

/* Casting a Spell:
 * To cast a spell you take an appropriate action and gain tem-
 * porary Corruption. A cantrip causes 1 point of temporary
 * Corruption while a leveled spell causes 1d4 plus the spell’s
 * level points of temporary Corruption.
 *
 * When you cast a favored cantrip you gain no Corruption, and
 * when you cast a leveled favored spell you gain Corruption
 * equal only to the level of the spell.
 */

export class Spellcasting {

  static NAME = "Spellcasting";

  static register() {
    this.patch();
    this.hooks();
  }

  static patch() {
    this._patchItem();
    this._patchAbilityUseDialog();
  }

  static hooks() {
    Hooks.on('renderAbilityUseDialog', this._renderAbilityUseDialog);
  }

  static _patchItem() {
    COMMON.addGetter(COMMON.CLASSES.Item5e.prototype, 'corruption', function() {
        return Spellcasting._corruptionExpression(this.data);
    });

    /* isFavored getter */
    COMMON.addGetter(COMMON.CLASSES.Item5e.prototype, 'isFavored', function() {

      return Spellcasting._isFavored(this.data);
    });
  }

  static _patchAbilityUseDialog() {
    const wrapped = game.dnd5e.applications.AbilityUseDialog._getSpellData;

    game.dnd5e.applications.AbilityUseDialog._getSpellData = function(actorData, itemData, returnData) {
      logger.debug(actorData, itemData, returnData);
      wrapped.bind(this)(actorData, itemData, returnData);

      Spellcasting._getSpellData(actorData, itemData, returnData);
     
      logger.debug("_getSpellData result:", returnData);
    }
  }

  static _renderAbilityUseDialog(app, html, data){

    /* only modify spell use dialogs */
    if(app.item?.type !== 'spell') return;

    const element = html.find('[name="consumeSlot"]');

    /* get all text elements */
    const textNodes = element.parent().contents().filter( function() {return this.nodeType === 3} )

    if(textNodes.length !== 1){
      logger.error(COMMON.localize('SYB5E.Error.HTMLParse'));
    }

    textNodes[0].textContent = COMMON.localize('SYB5E.GainCorruptionQ');

    return;
  }

  /* MECHANICS HELPERS */

  /* get max spell level based
   * on highest class progression
   * NOTE: this is probably excessive
   *   but since its a single display value
   *   we want to show the higest value
   * @param classData {array<classItemData>}
   */
  static maxSpellLevel(classData) {
    
    const maxLevel = Object.values(classData).reduce( (acc, cls) => {

      const progression = cls.spellcasting.progression;
      const spellLevel = SYB5E.CONFIG.SPELL_PROGRESSION[progression][cls.levels];

      return spellLevel > acc ? spellLevel : acc;

    },0);

    return maxLevel;
  }

  static _isFavored(itemData) {
    const key = SYB5E.CONFIG.FLAG_KEY.favored;
    
    const defaultVal = SYB5E.CONFIG.DEFAULT_ITEM[COMMON.DATA.name][key]
    const favored = getProperty(itemData, SYB5E.CONFIG.PATHS[key]) ?? defaultVal;
    return favored;
  }

  static _corruptionExpression(itemData, level = itemData.data.level) {

    /* non-spells can't corrupt */
    if (itemData.type !== 'spell'){
      return
    }

    /* cantrips have a level of "0" (string) for some reason */
    level = parseInt(level);

    if (Spellcasting._isFavored(itemData)) {
      /* favored cantrips cost 0, favored spells cost level */
      return level == 0 ? '0' : `${level}`
    }

    /* cantrips cost 1, leveled spells are 1d4+level */
    return level == 0? '1' : `1d4 + ${level}`;

  }

  /** \MECHANICS HELPERS **/

  /** PATCH FUNCTIONS **/

  static _getSpellData(actorData, itemData, returnData) {
    
    /****************
     * Needed Info:
     * - spellLevels: {array} of {level: 1, label: '1st Level (0 Slots)', canCast: true, hasSlots: false}
     * - errors: {array<string>}: clear out spell slot error from base dnd5e, add our own.
     *     - exceeding max spell level
     * - consumeSpellSlot: {boolean}: always true (consume slot = add corruption)
     * - canUse: {boolean}: always true? exceeding max corruption is a choice
     */
    const maxLevel = Spellcasting.maxSpellLevel(actorData.classes);
    let spellLevels = [];

    for(let level = 1; level<=maxLevel; level++){
      spellLevels.push({
        level,
        label: COMMON.localize( `DND5E.SpellLevel${level}`)+` (${Spellcasting._corruptionExpression(returnData.item, level)})`,
        canCast: true,
        hasSlots: true
      })
    }

    const sybData = {note: 'Hello from SYB5E', errors: [], spellLevels, consumeSpellSlot: true, canUse: true}
    mergeObject(returnData, sybData);
  }

  static _getUsageUpdates(item, {consumeCorruption}) {

    /* mirror core dnd5e structure */
    const actorUpdates = {};
    const itemUpdates = {};
    const resourceUpdates = {};

    /* Does this casting produce corruption? */
    if (consumeCorruption) {

      /* roll for corruption */
      const corruptionExpression = item.corruption;
      const gainedCorruption = new Roll(corruptionExpression).evaluate({async:false}).total;

      /* field name shortcuts */
      const corruptionKey = SYB5E.CONFIG.FLAG_KEY.corruption;
      const tempKey = corruptionKey.temp;

      /* get the current corruption values */
      let corruption = item.actor.corruption;

      /* add in our gained corruption to the temp corruption */
      corruption[tempKey] = corruption[tempKey] + gainedCorruption;

      /* insert this update into the actorUpdates */
      const tempPath = `flags.${COMMON.DATA.name}.${corruptionKey.root}.${tempKey}`;
      actorUpdates[tempPath] = corruption[tempKey];
    }

    return {actorUpdates, itemUpdates, resourceUpdates};

  }

}
