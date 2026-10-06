const WIDTH = 390;
const HEIGHT = 844;

const run = {
  gold: 0,
  maxHp: 100,
  hp: 100,
  ammo: 3,
  equipment: [],
  mercenaries: [],
  skillLevel: 0,
  equipmentLevel: 0,
  stage: 1
};

const colors = {
  ink: 0x172033,
  panel: 0x263452,
  gold: 0xf6c85f,
  pale: 0xf7edd3,
  red: 0xd95d5d,
  green: 0x8ccf7e,
  blue: 0x72b7e2,
  monster: 0x9c5f6a
};

function label(scene, x, y, text, size = 16, color = '#f7edd3', style = {}) {
  return scene.add.text(x, y, text, { fontFamily: 'system-ui, sans-serif', fontSize: `${size}px`, color, ...style });
}

class BattleScene extends Phaser.Scene {
  constructor() { super('battle'); }

  preload() {
    this.load.json('stageData', 'data/stages.json');
  }

  create() {
    this.stageData = this.cache.json.get('stageData');
    this.stageConfig = this.stageData.stages.find(stage => stage.id === run.stage);
    this.enemies = [];
    this.shots = [];
    this.wave = 1;
    this.spawned = 0;
    this.targetCount = 6;
    this.spawning = true;
    this.gameEnded = false;
    this.lastAutoShot = 0;
    this.lastMercenaryShot = 0;
    this.drawBackground();
    this.createHud();
    this.startWave();
    this.spawnTimer = this.time.addEvent({ delay: 900, loop: true, callback: this.trySpawn, callbackScope: this });
    this.ammoTimer = this.time.addEvent({ delay: 3000, loop: true, callback: this.rechargeAmmo, callbackScope: this });
    this.input.on('pointerdown', pointer => {
      if (!this.gameEnded && pointer.y < HEIGHT - 105) this.manualAttack(pointer.x, pointer.y);
    });
  }

  drawBackground() {
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x6fa85f);
    for (let y = 45; y < HEIGHT; y += 64) this.add.rectangle(WIDTH / 2, y, WIDTH, 32, 0x82b96b, 0.42);
    for (let x = 114; x < WIDTH; x += 55) {
      this.add.circle(x, 120 + (x * 19 % 590), 3, 0xa5d67d, 0.7);
      this.add.circle(x + 14, 150 + (x * 23 % 560), 2, 0x4b8549, 0.7);
    }
    this.add.rectangle(43, HEIGHT / 2, 86, HEIGHT, 0x7f6751);
    this.add.rectangle(89, HEIGHT / 2, 8, HEIGHT, 0x5d463b);
    for (let y = 24; y < HEIGHT; y += 40) this.add.rectangle(40, y, 72, 3, 0xa38a69, 0.65);
    this.add.rectangle(46, 145, 96, 17, 0x64463b);
    this.add.rectangle(16, 130, 20, 28, 0x6d4e42);
    this.add.rectangle(46, 130, 20, 28, 0x6d4e42);
    this.add.rectangle(76, 130, 20, 28, 0x6d4e42);
    this.add.circle(73, 118, 16, colors.blue).setStrokeStyle(2, 0xf7edd3);
    this.add.rectangle(73, 138, 24, 12, 0x4c6b9a);
  }

  createHud() {
    this.add.rectangle(WIDTH / 2, 10, WIDTH, 20, colors.ink, 0.7);
    this.add.rectangle(8, 10, 106, 7).setOrigin(0, 0.5).setStrokeStyle(1, colors.ink);
    this.hpBar = this.add.rectangle(8, 10, 104, 5, colors.green).setOrigin(0, 0.5);
    this.hpText = label(this, 119, 3, '', 10, '#f7edd3');
    this.goldText = label(this, 334, 3, '', 10, '#f6c85f');
    this.add.rectangle(WIDTH / 2, HEIGHT - 58, WIDTH - 24, 82, colors.ink, 0.92).setStrokeStyle(2, 0x61738e);
    this.ammoText = label(this, 24, HEIGHT - 86, '', 18, '#f6c85f');
    this.tipText = label(this, 24, HEIGHT - 57, '화면을 터치해 강력한 화살을 쏘세요', 13, '#d4dfeb');
    this.mercText = label(this, 286, HEIGHT - 86, '', 12, '#d4dfeb').setOrigin(0.5);
    this.updateHud();
  }

  updateHud() {
    this.goldText.setText(`🪙${run.gold}`);
    this.hpText.setText(`${Math.ceil(run.hp)}/${run.maxHp}`);
    this.hpBar.width = 104 * Math.max(0, run.hp / run.maxHp);
    this.ammoText.setText(`강화 화살  ${'●'.repeat(run.ammo)}${'○'.repeat(3 - run.ammo)}`);
    this.mercText.setText(run.mercenaries.length ? `용병 ${run.mercenaries.length}명` : '용병 없음');
  }

  startWave() {
    this.spawned = 0;
    const waveConfig = this.stageConfig.waves[this.wave - 1];
    this.spawnQueue = waveConfig.enemies.flatMap(group => Array(group.count).fill(group.type));
    this.targetCount = this.spawnQueue.length;
    this.spawning = true;
    this.showNotice(`웨이브 ${this.wave} 시작`);
  }

  trySpawn() {
    if (!this.spawning || this.gameEnded) return;
    if (this.spawned >= this.targetCount) {
      this.spawning = false;
      return;
    }
    this.spawnEnemy(this.spawnQueue[this.spawned]);
    this.spawned++;
  }

  spawnEnemy(typeKey) {
    const definition = this.stageData.monsterTypes[typeKey];
    const { hp, size, speed, damage, reward, autoDamageMultiplier, strongDamageMultiplier } = definition;
    const body = this.add.container(WIDTH + size, Phaser.Math.Between(75, HEIGHT - 145));
    body.add(this.add.circle(0, 0, size, Number(definition.color)));
    body.add(this.add.circle(-size * 0.35, -3, 3, 0xfff4c4));
    body.add(this.add.circle(size * 0.35, -3, 3, 0xfff4c4));
    const barBg = this.add.rectangle(0, -size - 10, size * 2, 5, 0x262331);
    const bar = this.add.rectangle(-size, -size - 10, size * 2, 5, 0x8ccf7e).setOrigin(0, 0.5);
    body.add([barBg, bar]);
    this.enemies.push({ body, bar, hp, maxHp: hp, speed, damage, reward, size, autoDamageMultiplier, strongDamageMultiplier });
  }

  nearestEnemy(x, y) {
    return this.enemies.reduce((best, enemy) => {
      const distance = Phaser.Math.Distance.Between(x, y, enemy.body.x, enemy.body.y);
      return !best || distance < best.distance ? { enemy, distance } : best;
    }, null)?.enemy;
  }

  fire(target, damage, tint, attackType = 'auto') {
    if (!target) return;
    const shot = this.add.circle(92, 122, 8, tint).setStrokeStyle(2, 0xffffff);
    this.shots.push({ shot, target, damage, attackType, speed: 580 });
  }

  manualAttack(x, y) {
    if (!run.ammo) { this.showNotice('강화 화살을 충전 중입니다'); return; }
    const target = this.nearestEnemy(x, y);
    if (!target) { this.showNotice('조준할 몬스터가 없습니다'); return; }
    run.ammo--;
    this.fire(target, 38 + run.skillLevel * 6 + run.equipmentLevel * 2, colors.gold, 'strong');
    this.updateHud();
  }

  rechargeAmmo() {
    if (run.ammo < 3 && !this.gameEnded) { run.ammo++; this.updateHud(); }
  }

  autoAttack(time) {
    if (time - this.lastAutoShot > 850) {
      this.fire(this.nearestEnemy(92, 122), 11 + run.skillLevel * 2 + run.equipmentLevel * 2, colors.blue);
      this.lastAutoShot = time;
    }
    if (run.mercenaries.length && time - this.lastMercenaryShot > 1050) {
      for (let index = 0; index < run.mercenaries.length; index++) this.fire(this.nearestEnemy(92, 150 + index * 24), 8 + run.equipmentLevel, 0xb9e2a5);
      this.lastMercenaryShot = time;
    }
  }

  hit(enemy, damage, attackType) {
    const index = this.enemies.indexOf(enemy);
    if (index < 0) return;
    enemy.hp -= damage * (attackType === 'strong' ? enemy.strongDamageMultiplier : enemy.autoDamageMultiplier);
    enemy.bar.width = enemy.size * 2 * Math.max(0, enemy.hp / enemy.maxHp);
    if (enemy.hp <= 0) this.killEnemy(enemy);
  }

  killEnemy(enemy) {
    const index = this.enemies.indexOf(enemy);
    if (index < 0) return;
    this.enemies.splice(index, 1);
    enemy.body.destroy();
    run.gold += enemy.reward;
    const isDrop = enemy.boss || Math.random() < 0.14;
    if (isDrop) {
      const items = ['청동 검', '수호 방패', '바람 장화', '사냥 활'];
      const item = items[Phaser.Math.Between(0, items.length - 1)];
      run.equipment.push(item);
      this.showNotice(`${item} 획득!`);
    }
    this.updateHud();
    this.checkWaveComplete();
  }

  checkWaveComplete() {
    if (this.spawning || this.enemies.length) return;
    if (this.wave < this.stageConfig.waves.length) {
      this.wave++;
      this.time.delayedCall(1500, this.startWave, [], this);
    } else {
      this.gameEnded = true;
      this.time.delayedCall(900, () => this.scene.start('camp'), [], this);
    }
  }

  damageCastle(amount) {
    run.hp -= amount;
    this.updateHud();
    this.cameras.main.shake(130, 0.009);
    if (run.hp <= 0) this.gameOver();
  }

  gameOver() {
    this.gameEnded = true;
    this.spawnTimer.remove();
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x101522, 0.8);
    label(this, WIDTH / 2, 340, '성이 무너졌습니다', 29, '#ffffff').setOrigin(0.5);
    const retry = label(this, WIDTH / 2, 410, '처음부터 다시 도전', 18, '#172033', { backgroundColor: '#f6c85f', padding: { x: 18, y: 12 } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    retry.on('pointerdown', () => { Object.assign(run, { gold: 0, hp: 100, ammo: 3, equipment: [], mercenaries: [], skillLevel: 0, equipmentLevel: 0, stage: 1 }); this.scene.restart(); });
  }

  showNotice(message) {
    if (this.notice) this.notice.destroy();
    this.notice = label(this, WIDTH / 2, 120, message, 17, '#ffffff', { backgroundColor: '#172033cc', padding: { x: 12, y: 8 } }).setOrigin(0.5);
    this.tweens.add({ targets: this.notice, alpha: 0, delay: 1200, duration: 350, onComplete: () => this.notice?.destroy() });
  }

  update(time, delta) {
    if (this.gameEnded) return;
    this.autoAttack(time);
    for (const enemy of [...this.enemies]) {
      enemy.body.x -= enemy.speed * delta / 1000;
      if (enemy.body.x < 94) {
        this.enemies.splice(this.enemies.indexOf(enemy), 1);
        enemy.body.destroy();
        this.damageCastle(enemy.damage);
        this.checkWaveComplete();
      }
    }
    for (const projectile of [...this.shots]) {
      if (!this.enemies.includes(projectile.target)) { projectile.shot.destroy(); this.shots.splice(this.shots.indexOf(projectile), 1); continue; }
      const angle = Phaser.Math.Angle.Between(projectile.shot.x, projectile.shot.y, projectile.target.body.x, projectile.target.body.y);
      projectile.shot.x += Math.cos(angle) * projectile.speed * delta / 1000;
      projectile.shot.y += Math.sin(angle) * projectile.speed * delta / 1000;
      if (Phaser.Math.Distance.Between(projectile.shot.x, projectile.shot.y, projectile.target.body.x, projectile.target.body.y) < 18) {
        projectile.shot.destroy();
        this.shots.splice(this.shots.indexOf(projectile), 1);
        this.hit(projectile.target, projectile.damage, projectile.attackType);
      }
    }
  }
}

class CampScene extends Phaser.Scene {
  constructor() { super('camp'); }

  create() {
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x202b42);
    this.add.circle(300, 130, 76, 0x526988);
    this.add.rectangle(0, 580, WIDTH, 264, 0x453b44).setOrigin(0);
    label(this, 24, 38, '성 내부 · 정비 시간', 26, '#f7edd3');
    this.goldText = label(this, 25, 82, '', 18, '#f6c85f');
    label(this, 25, 126, '다음 전투를 준비하세요.', 15, '#cbd8e8');
    this.makeButton(25, 182, '용병 고용  50G', () => this.hireMercenary());
    this.makeButton(25, 260, '스킬 강화  35G', () => this.upgradeSkill());
    this.makeButton(25, 338, '장비 강화  40G', () => this.upgradeEquipment());
    this.equipmentText = label(this, 25, 450, '', 14, '#d4dfeb', { wordWrap: { width: 340 } });
    this.nextButton = this.makeButton(25, 670, '다음 전투 시작', () => this.startNextStage(), '#8ccf7e', '#172033');
    this.refresh();
  }

  makeButton(x, y, text, action, fill = '#344b65', color = '#f7edd3') {
    const button = label(this, x, y, text, 18, color, { backgroundColor: fill, padding: { x: 18, y: 14 }, fixedWidth: 340, align: 'center' }).setInteractive({ useHandCursor: true });
    button.on('pointerdown', action);
    return button;
  }

  hireMercenary() {
    if (run.mercenaries.length >= 2) return this.notice('용병은 최대 2명입니다');
    if (run.gold < 50) return this.notice('골드가 부족합니다');
    const jobs = ['궁수', '검사', '마법사', '창병'];
    run.gold -= 50;
    run.mercenaries.push(jobs[run.mercenaries.length]);
    this.refresh(); this.notice(`${run.mercenaries.at(-1)}을 고용했습니다`);
  }

  upgradeSkill() {
    if (run.gold < 35) return this.notice('골드가 부족합니다');
    run.gold -= 35; run.skillLevel++; this.refresh(); this.notice('스킬 공격력이 올랐습니다');
  }

  upgradeEquipment() {
    if (!run.equipment.length) return this.notice('강화할 장비가 없습니다');
    if (run.gold < 40) return this.notice('골드가 부족합니다');
    run.gold -= 40; run.equipmentLevel++; this.refresh(); this.notice('장비를 강화했습니다');
  }

  refresh() {
    this.goldText.setText(`보유 골드  🪙 ${run.gold}`);
    const equipment = run.equipment.length ? run.equipment.join(', ') : '아직 획득한 장비가 없습니다';
    this.equipmentText.setText(`용병: ${run.mercenaries.join(', ') || '없음'}\n스킬 레벨: ${run.skillLevel}  |  장비 강화: +${run.equipmentLevel}\n\n보유 장비\n${equipment}`);
  }

  startNextStage() {
    const stageData = this.cache.json.get('stageData');
    const nextStage = stageData.stages.find(stage => stage.id === run.stage + 1);
    if (!nextStage) return this.notice('다음 스테이지는 준비 중입니다');
    run.stage++;
    run.hp = run.maxHp;
    run.ammo = 3;
    this.scene.start('battle');
  }

  notice(text) {
    if (this.message) this.message.destroy();
    this.message = label(this, WIDTH / 2, 615, text, 15, '#ffffff', { backgroundColor: '#172033', padding: { x: 12, y: 9 } }).setOrigin(0.5);
    this.time.delayedCall(1400, () => this.message?.destroy());
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#172033',
  scene: [BattleScene, CampScene],
  render: { antialias: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }
});
