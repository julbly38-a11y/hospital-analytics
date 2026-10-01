-- Публічна структура Чернівецької обласної клінічної лікарні (ЄДРПОУ 43288621) з офіційного сайту okl.cv.ua.
-- Джерела: https://okl.cv.ua/hospital-structure/ (відділення, ліжка, служби, центри), https://okl.cv.ua/management/ (посади
-- адміністрації, контакти), зчитано 2026-10-01. Ідемпотентно: можна запускати повторно (оновлює за ключом org+kind+name).
-- Це НЕ дані з helsi: ідентифікатори відділень (structure_id) невідомі, тому lpz_departments не заповнюється.
BEGIN;
INSERT INTO lpz.lpz_org_public_structure (org_edrpou, kind, name, beds, note, source_url, retrieved_on) VALUES
-- підсумок
('43288621','summary','Загальна кількість ліжок',809,'хірургічний профіль 395 + терапевтичний 391 + анестезіологія й реанімація 23','https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','summary','Хірургічний профіль, разом ліжок',395,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','summary','Терапевтичний профіль, разом ліжок',391,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
-- хірургічний профіль
('43288621','inpatient_surgical','Відділення хірургії',60,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','inpatient_surgical','Відділення інтервенційної кардіології та кардіохірургії',20,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','inpatient_surgical','Відділення торакальної хірургії',10,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','inpatient_surgical','Відділення судинної хірургії',35,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','inpatient_surgical','Відділення щелепно-лицевої хірургії',30,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','inpatient_surgical','Центр мікрохірургії ока',55,'обласний центр травми ока','https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','inpatient_surgical','ЛОР-центр',50,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','inpatient_surgical','Відділення ортопедії та травматології',45,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','inpatient_surgical','Відділення гінекології',35,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','inpatient_surgical','Відділення урології',24,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','inpatient_surgical','Центр трансплантації',6,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','inpatient_surgical','Відділення проктології',25,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
-- терапевтичний профіль
('43288621','inpatient_therapeutic','Відділення гастроентерології',40,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','inpatient_therapeutic','Відділення пульмонології',45,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','inpatient_therapeutic','Відділення нефрології',40,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','inpatient_therapeutic','Відділення кардіології',50,'з ревматологічними ліжками (за старішою сторінкою сайту)','https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','inpatient_therapeutic','Відділення неврології',30,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','inpatient_therapeutic','Відділення клінічної онкології',20,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','inpatient_therapeutic','Відділення інфекційних хвороб',60,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','inpatient_therapeutic','Відділення реабілітації',40,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','inpatient_therapeutic','Відділення ендокринології',45,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','inpatient_therapeutic','Відділення паліативної допомоги',15,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','inpatient_therapeutic','Відділення невідкладної медичної допомоги',6,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
-- реанімація
('43288621','icu','Відділення анестезіології, інтенсивної терапії і політравми',23,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
-- амбулаторні
('43288621','outpatient','Консультативно-діагностична поліклініка №1',NULL,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','outpatient','Ендокринологічна поліклініка №2',25,'денні ліжка','https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','outpatient','Шкірно-венерологічна поліклініка №3',15,'денні ліжка','https://okl.cv.ua/hospital-structure/','2026-10-01'),
-- діагностика й допоміжні служби
('43288621','diagnostic_support','Відділення ендоскопії',NULL,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','diagnostic_support','Відділення амбулаторного гемодіалізу',NULL,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','diagnostic_support','Відділення гіпербаричної оксигенації',NULL,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','diagnostic_support','Відділення рентгенології',NULL,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','diagnostic_support','Відділення ультразвукової діагностики',NULL,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','diagnostic_support','Клініко-діагностична лабораторія',NULL,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','diagnostic_support','Центральна стерилізаційна',NULL,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','diagnostic_support','Лікарняний банк крові',NULL,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','diagnostic_support','Гістологічна лабораторія',NULL,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
-- центри (профільні, що вже входять до відділень вище)
('43288621','center','Центр мікрохірургії ока',NULL,'обласний центр травми ока; ліжка враховані у відділеннях','https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','center','ЛОР-центр',NULL,'ліжка враховані у відділеннях','https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','center','Центр трансплантації',NULL,'ліжка враховані у відділеннях','https://okl.cv.ua/hospital-structure/','2026-10-01'),
-- інші підрозділи
('43288621','other_unit','Апарат управління',NULL,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','other_unit','Аптечна служба',NULL,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','other_unit','Бухгалтерія',NULL,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','other_unit','Юридичний відділ',NULL,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','other_unit','Патологоанатомічне відділення',NULL,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','other_unit','Відділ мобільної паліативної допомоги',NULL,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
('43288621','other_unit','Відділ інфекційного контролю',NULL,NULL,'https://okl.cv.ua/hospital-structure/','2026-10-01'),
-- адміністрація (лише посади)
('43288621','administration','Генеральний директор',NULL,NULL,'https://okl.cv.ua/management/','2026-10-01'),
('43288621','administration','Заступник генерального директора',NULL,NULL,'https://okl.cv.ua/management/','2026-10-01'),
('43288621','administration','Медичний директор',NULL,NULL,'https://okl.cv.ua/management/','2026-10-01'),
('43288621','administration','Медичний директор з хірургічної роботи',NULL,NULL,'https://okl.cv.ua/management/','2026-10-01'),
('43288621','administration','Медичний директор з організації невідкладної допомоги',NULL,NULL,'https://okl.cv.ua/management/','2026-10-01'),
('43288621','administration','Заступник з правових питань',NULL,NULL,'https://okl.cv.ua/management/','2026-10-01'),
('43288621','administration','Заступник з кадрових питань',NULL,NULL,'https://okl.cv.ua/management/','2026-10-01'),
('43288621','administration','Заступник з економічних питань',NULL,NULL,'https://okl.cv.ua/management/','2026-10-01'),
('43288621','administration','Заступник з адміністративно-господарських питань',NULL,NULL,'https://okl.cv.ua/management/','2026-10-01'),
('43288621','administration','Головний бухгалтер',NULL,NULL,'https://okl.cv.ua/management/','2026-10-01'),
('43288621','administration','Головна медична сестра (терапевтична робота)',NULL,NULL,'https://okl.cv.ua/management/','2026-10-01'),
('43288621','administration','Головна медична сестра (хірургічна робота)',NULL,NULL,'https://okl.cv.ua/management/','2026-10-01'),
('43288621','administration','Начальник організаційно-методичного відділу',NULL,NULL,'https://okl.cv.ua/management/','2026-10-01'),
('43288621','administration','Начальник аптечної служби',NULL,NULL,'https://okl.cv.ua/management/','2026-10-01'),
('43288621','administration','Начальник відділу інфекційного контролю',NULL,NULL,'https://okl.cv.ua/management/','2026-10-01'),
('43288621','administration','Провідний фахівець цивільного захисту',NULL,NULL,'https://okl.cv.ua/management/','2026-10-01'),
('43288621','administration','Фахівець охорони праці',NULL,NULL,'https://okl.cv.ua/management/','2026-10-01'),
-- контакти закладу
('43288621','contact','Телефон',NULL,'050 103 00 30','https://okl.cv.ua/management/','2026-10-01'),
('43288621','contact','Адреса',NULL,'м. Чернівці, вул. Головна, 137','https://okl.cv.ua/management/','2026-10-01'),
('43288621','contact','Режим роботи',NULL,'09:00-17:30','https://okl.cv.ua/management/','2026-10-01')
ON CONFLICT (org_edrpou, kind, name) DO UPDATE
  SET beds = EXCLUDED.beds, note = EXCLUDED.note, source_url = EXCLUDED.source_url, retrieved_on = EXCLUDED.retrieved_on;
COMMIT;
