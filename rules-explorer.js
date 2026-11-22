/* Read-only references backed by the builder's 2014-era catalogs. */
(() => {
  const selected = {classes: '', races: '', backgrounds: ''};
  const slug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const pagePath = (kind, id) => '/' + kind + (id ? '/' + encodeURIComponent(id) : '');
  const searchWords = text => text.toLowerCase().match(/[a-z0-9]+/g) || [];
  const title = text => text.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  const jump = (id, label) => '<a href="#' + esc(id) + '" data-rules-jump>' + esc(label) + '</a>';
  const paragraphs = rows => rows.filter(Boolean).map(row => '<p>' + esc(row) + '</p>').join('');
  const list = rows => '<ul>' + rows.map(row => '<li>' + row + '</li>').join('') + '</ul>';
  const labels = rows => list(rows.filter(([, value]) => value).map(([name, value]) =>
    '<strong>' + esc(name) + '.</strong> ' + esc(value)));
  const source = url => /^https?:\/\//.test(url || '') ? '<p>' + sourceLink(url) + '</p>' : '';
  const contents = links => '<details class="rules-contents" open><summary>Table of Contents</summary>' + list(links) + '</details>';
  const signed = value => typeof value === 'number' ? '+' + value : value;
  const sorted = rows => rows.sort((a, b) => a.name.localeCompare(b.name));

  function catalog(kind) {
    if (kind === 'classes') return sorted(CLASSES.filter(row => !row.custom));
    if (kind === 'backgrounds') return sorted(BACKGROUNDS.filter(row => !(CUSTOM.bgs || []).some(custom => custom.id === row.id)));
    const families = new Map();
    for (const race of RACES) {
      if (!race.catalog || RACE_SOURCE_DENYLIST.has(race.sourceCode)) continue;
      const name = race.family || race.name;
      if (!families.has(name)) families.set(name, {id: slug(name), name, races: []});
      families.get(name).races.push(race);
    }
    return sorted([...families.values()]);
  }

  function progression(klass, features) {
    const rows = classAdvancementRows({klass: klass.id});
    const art = klass.id === 'artificer';
    const statNames = {rage_count:'Rages', rage_damage_bonus:'Rage Damage', martial_arts:'Martial Arts'};
    const stats = [...new Set(rows.flatMap(row => Object.keys(row.specific)))].filter(key =>
      key !== 'brutal_critical_dice' && rows.some(row => ['number', 'string'].includes(typeof row.specific[key])));
    const maxSlot = rows.reduce((max, row) => Math.max(max, row.slots.findLastIndex(Boolean) + 1), 0);
    const slots = Array.from({length: maxSlot}, (_, index) => index + 1);
    const known = rows.some(row => Number.isFinite(row.sc.spells_known));
    const cantrips = art || rows.some(row => Number.isFinite(row.sc.cantrips_known));
    const featureIds = new Map(features.map(feature => [feature.name, feature.anchor]));
    const columns = ['Level', 'Proficiency Bonus', 'Features', ...stats.map(key => statNames[key] || title(key)),
      ...(art ? ['Infusions Known', 'Infused Items'] : []),
      ...(cantrips ? ['Cantrips Known'] : []), ...(known ? ['Spells Known'] : []),
      ...slots.map(level => 'Level ' + level + ' Slots')];
    return `<div class="rules-progression" tabindex="0" role="region" aria-label="${esc(klass.name)} progression">
      <table><caption>The ${esc(klass.name)}</caption><thead><tr>${columns.map(column => '<th scope="col">' + esc(column) + '</th>').join('')}</tr></thead>
      <tbody>${rows.map(row => {
        const level = row.level;
        const numbers = stats.map(key => key === 'rage_damage_bonus' ? signed(row.specific[key]) : row.specific[key]);
        if (art) numbers.push(level < 2 ? '—' : Math.min(12, 4 + 2 * Math.floor((Math.max(2, level) - 2) / 4)),
          level < 2 ? '—' : Math.min(6, 2 + Math.floor((Math.max(2, level) - 2) / 4)));
        if (cantrips) numbers.push(art ? (level < 10 ? 2 : level < 14 ? 3 : 4) : row.sc.cantrips_known);
        if (known) numbers.push(row.sc.spells_known);
        numbers.push(...slots.map(slot => row.slots[slot - 1] || '—'));
        const names = row.features.map(name => featureIds.has(name) ? jump(featureIds.get(name), name) : esc(name));
        return '<tr><th scope="row">' + level + '</th><td>+' + row.pb + '</td><td>' +
          (names.join(', ') || '—') + '</td>' + numbers.map(value => '<td>' + esc(value ?? '—') + '</td>').join('') + '</tr>';
      }).join('')}</tbody></table></div>`;
  }

  function classPage(klass) {
    const data = CLASS_DATA.find(row => row.index === klass.id);
    const url = klass.source || 'https://dnd5e.wikidot.com/' + klass.id;
    const features = FEATURES.filter(row => row.class?.index === klass.id && !row.subclass && !row.parent && !row.prerequisites?.length)
      .filter((row, index, all) => all.findIndex(feature => feature.name === row.name) === index)
      .sort((a, b) => a.level - b.level)
      .map((row, index) => ({...row, anchor: 'class-feature-' + index}));
    const subclasses = subsFor(klass.id).filter(row => !row.custom && !(CUSTOM.subs || []).some(sub => sub.id === row.id));
    const requirements = data?.multi_classing?.prerequisites?.map(rule => (ABL_NAMES[rule.ability_score.index] || rule.ability_score.name) + ' ' + rule.minimum_score).join(' and ');
    const tools = data?.proficiencies?.filter(row => /tool|supplies|instrument|kit/i.test(row.name)).map(row => row.name).join(', ');
    const equipment = data ? [...data.starting_equipment.map(row => row.quantity + ' × ' + row.equipment.name),
      ...data.starting_equipment_options.map(row => row.desc)] : klass.equipment || [];
    const subclassHeading = klass.subclass?.name?.startsWith('Path of') ? 'Primal Paths' : 'Subclasses';

    return `<p class="rules-intro">${esc(klass.desc || '')}</p>
      <p><strong>Multiclass prerequisite.</strong> ${esc(requirements || (klass.id === 'artificer' ? 'Intelligence 13' : klass.id === 'fighter' ? 'Strength 13 or Dexterity 13' : 'See the class source.'))}</p>
      ${progression(klass, features)}
      ${contents([jump('class-features', 'Class Features'), jump('hit-points', 'Hit Points'), jump('proficiencies', 'Proficiencies'), jump('equipment', 'Starting Equipment'), jump('subclasses', subclassHeading)])}
      <section><h2 id="class-features">Class Features</h2>
      <h3 id="hit-points">Hit Points</h3>${labels([
        ['Hit Dice', '1d' + klass.hitDie + ' per ' + klass.name + ' level'],
        ['At 1st Level', klass.hitDie + ' + your Constitution modifier'],
        ['At Higher Levels', '1d' + klass.hitDie + ' (or ' + (Math.floor(klass.hitDie / 2) + 1) + ') + your Constitution modifier per level after 1st']
      ])}
      <h3 id="proficiencies">Proficiencies</h3>${labels([
        ['Armor', klass.armor], ['Weapons', klass.weapons],
        ['Tools', tools || (klass.id === 'artificer' ? 'Thieves’ tools, tinker’s tools, and one type of artisan’s tools' : 'See class source for any tool choices')],
        ['Saving Throws', (klass.saves || []).map(key => ABL_NAMES[key]).join(', ')],
        ['Skills', klass.skillCount ? 'Choose ' + klass.skillCount + ' from ' + (klass.skillList || []).map(key => SKILLS.find(skill => skill.id === key)?.name || key).join(', ') : '']
      ])}
      <h3 id="equipment">Starting Equipment</h3>${list(equipment.filter(Boolean).map(esc))}
      ${features.map(feature => `<section class="rules-feature"><h3 id="${feature.anchor}">${esc(feature.name)} <small>Level ${feature.level}</small></h3>${classRulesContent(feature, url).html}</section>`).join('')}
      </section>
      <section><h2 id="subclasses">${subclassHeading}</h2>
      ${subclasses.map(sub => {
        const context = {klass: klass.id, subId: sub.id};
        const subURL = sub.source || 'https://dnd5e.wikidot.com/' + subclassKey(context);
        return `<details class="rules-subclass"><summary>${esc(sub.name)}</summary>${paragraphs([sub.desc])}
          ${subclassAllFeatures(context).map(feature => `<h4>${esc(feature.name)} <small>Level ${feature.level}</small></h4>${subclassRulesContent(feature, subURL).html}`).join('')}
          ${source(subURL)}</details>`;
      }).join('')}</section>${source(url)}`;
  }

  const raceBestiaryArt = {
    "Bullywug": "assets/monsters/c1487bdba11fa53e62a71f8f.webp",
    "Gnoll": "assets/monsters/cb828d7d95588d4a387ba7b2.webp",
    "Grimlock": "assets/monsters/cf8146e3badba205f493a9c2.webp",
    "Kuo-Toa": "assets/monsters/629a9f499773c1f82e6c0366.webp",
    "Skeleton": "assets/monsters/669870ac4c9ac927c0b3d8ac.webp",
    "Troglodyte": "assets/monsters/5a6a2f278d1b194987f5afee.webp",
    "Zombie": "assets/monsters/1da21b38d1432e08206b42e9.webp",
  };

  function raceArt(family) {
    const art = RACE_HUMAN_ART[family.name] ||
      family.races.map(race => RACE_HUMAN_ART[raceArtKey(race)]).find(Boolean);
    const src = art?.src || raceBestiaryArt[family.name];
    if (!src) return '';
    return `<figure class="rules-race-art">
      <button type="button" data-rules-race-art="${esc(src)}" aria-label="Enlarge ${esc(family.name)} artwork">
        <img src="${esc(src)}" alt="${esc(family.name)} illustration" decoding="async">
      </button>
      <figcaption>${art ? raceArtCreditHTML(art) : 'Artwork from the 2014 Monster Manual'}</figcaption>
    </figure>`;
  }

  function racePage(family) {
    const groups = new Map();
    for (const race of family.races) {
      if (!groups.has(race.sourceCode)) groups.set(race.sourceCode, []);
      groups.get(race.sourceCode).push(race);
    }
    const sections = [...groups.entries()].sort(([a], [b]) => a === 'PHB' ? -1 : b === 'PHB' ? 1 : 0);
    const anchor = code => 'race-source-' + slug(code);
    const variantAnchor = race => 'race-variant-' + race.id;
    const links = sections.map(([code, races]) => jump(anchor(code), races[0].sourceName) +
      (races.length > 1 ? list(sorted(races).map(race => jump(variantAnchor(race), race.name))) : ''));
    return `<div class="rules-race-overview">${contents(links)}${raceArt(family)}</div>` + sections.map(([code, races]) => {
      const first = races[0];
      const shared = races.length > 1 ? first.traits.filter(([name, detail]) =>
        races.every(race => race.traits.some(([key, text]) => key === name && text === detail))) : [];
      return `<section class="rules-race-source"><h2 id="${anchor(code)}">${esc(first.sourceName)}</h2>
        ${shared.length ? '<h3>Shared Traits</h3>' + labels(shared) : ''}
        ${races.map(race => `<section class="rules-race-variant"><h3 id="${esc(variantAnchor(race))}">${esc(race.name)}</h3>
          ${labels([
            ['Ability Score Increase', (race.abilityOptions || []).map(catalogAbilityLabel).filter(Boolean).join(' or ')],
            ['Size', (race.sizeOptions || []).join(' or ') || race.size],
            ['Speed', Object.entries(race.movement || {walk: race.speed}).map(([type, speed]) =>
              title(type) + ' ' + (speed === true ? race.speed : speed) + ' ft.').join(', ')],
            ['Languages', (race.languageOptions || []).map(option => Object.entries(option).map(([key, value]) =>
              key === 'anyStandard' ? value + ' standard language(s) of your choice' :
              key === 'any' ? value + ' language(s) of your choice' : title(key)).join(', ')).join(' or ')],
            ...race.traits.filter(([name]) => !shared.some(([key]) => key === name))
          ])}${source(race.source)}</section>`).join('')}</section>`;
    }).join('');
  }

  function classCard(klass) {
    const art = CLASS_HUMAN_ART[klass.id];
    return `<a class="rules-class-card" data-rules-page href="${pagePath('classes', klass.id)}" aria-labelledby="card-${esc(klass.id)}">
      ${art ? `<img src="${esc(art.src)}" alt="" loading="lazy" decoding="async">` : ''}
      <div class="rules-class-card-body">
        <h2 id="card-${esc(klass.id)}">${esc(klass.name)}</h2>
        <small>${esc(klass.tag)}</small>
        <p>${esc(klass.desc)}</p>
        ${art ? `<small>Art by ${esc(art.credit)}</small>` : ''}
      </div>
    </a>`;
  }

  function backgroundPage(background) {
    const separator = background.feature.indexOf(':');
    const featureName = separator < 0 ? 'Background Feature' : background.feature.slice(0, separator);
    const description = separator < 0 ? background.feature : background.feature.slice(separator + 1).trim();
    const languages = languageRule(background, 'background').choices;
    return `<section><h2>Proficiencies</h2>${labels([
      ['Skills', (background.skills || []).map(id => SKILLS.find(skill => skill.id === id)?.name || id).join(', ')],
      ['Tools', (BACKGROUND_TOOL_PROFS[background.id] || []).join(', ')],
      ['Languages', languages ? languages + (languages === 1 ? ' language' : ' languages') + ' of your choice' : '']
    ])}</section>
    <section class="rules-feature"><h2>${esc(featureName)}</h2>${paragraphs([description])}</section>
    ${paragraphs([background.toa ? 'Source: Tomb of Annihilation' : 'Source: Player’s Handbook (2014)'])}`;
  }

  function renderReference(host, kind) {
    const rows = catalog(kind);
    const entry = rows.find(row => row.id === selected[kind]);
    const name = {classes: 'Classes', races: 'Races', backgrounds: 'Backgrounds'}[kind];
    const singular = {classes: 'class', races: 'race', backgrounds: 'background'}[kind];
    const detail = {classes: classPage, races: racePage, backgrounds: backgroundPage}[kind];
    host.innerHTML = `<article class="rules-explorer">
      ${entry ? `<a data-rules-page href="${pagePath(kind)}">← All ${name.toLowerCase()}</a>` : ''}
      <h1 tabindex="-1">${esc(entry?.name || name)}</h1>
      ${entry ? detail(entry) : `
        <div class="rules-search-bar"><label>Search ${name.toLowerCase()}<input type="search" data-rules-search placeholder="Search by ${singular} name"></label>
        <p role="status" data-rules-count></p></div><div data-rules-results class="rules-results-${kind}"></div>`}
      </article>`;
    const search = host.querySelector('[data-rules-search]');
    if (search) {
      const update = () => {
        const terms = searchWords(search.value);
        const matchesText = text => {
          const words = searchWords(text);
          return terms.every(term => words.some(word => word.includes(term)));
        };
        const matches = rows.filter(row => matchesText(row.name) ||
          row.races?.some(race => matchesText(race.name + ' ' + race.sourceName)));
        host.querySelector('[data-rules-count]').textContent = matches.length + ' of ' + rows.length + ' ' + name.toLowerCase();
        host.querySelector('[data-rules-results]').innerHTML = matches.length ? (kind === 'classes' ? matches.map(classCard).join('') : list(matches.map(row =>
          `<a data-rules-page href="${pagePath(kind, row.id)}">${esc(row.name)}</a>`))) : '<p>No matching entries.</p>';
      };
      search.addEventListener('input', update);
      update();
    }
    const artButton = host.querySelector('[data-rules-race-art]');
    if (artButton) artButton.onclick = () => openRaceImage(artButton.dataset.rulesRaceArt, entry.name);
    host.querySelector('.rules-explorer').addEventListener('click', event => {
      const link = event.target.closest('a[data-rules-page], a[data-rules-jump]');
      if (!link || event.button || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      event.preventDefault();
      if (link.hasAttribute('data-rules-jump')) {
        const target = document.getElementById(link.hash.slice(1));
        target?.scrollIntoView({block: 'start'});
        target?.setAttribute('tabindex', '-1');
        target?.focus({preventScroll: true});
        return;
      }
      select(kind, link.pathname.split('/')[2]);
      render();
      host.querySelector('h1')?.focus({preventScroll: true});
      window.scrollTo(0, 0);
    });
  }

  function select(kind, encoded) {
    try { selected[kind] = decodeURIComponent(encoded || ''); }
    catch { selected[kind] = ''; }
  }

  window.ForgeRulesExplorer = {render: renderReference, select, path: kind => pagePath(kind, selected[kind])};
  document.querySelectorAll('[data-site-view="classes"], [data-site-view="races"], [data-site-view="backgrounds"]').forEach(button =>
    button.addEventListener('click', () => select(button.dataset.siteView), {capture: true}));
})();
