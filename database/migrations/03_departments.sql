-- Етап: Структура відділень (категорії + блоки)

CREATE TABLE dept_categories (id bigserial PRIMARY KEY, name text NOT NULL UNIQUE);
INSERT INTO dept_categories (name) VALUES ('клінічне'), ('не_клінічне');

CREATE TABLE clinical_blocks (id bigserial PRIMARY KEY, name text NOT NULL UNIQUE);
INSERT INTO clinical_blocks (name) VALUES ('хірургічний'),('терапевтичний'),('інтенсивна_терапія');

ALTER TABLE departments ADD COLUMN category_id bigint REFERENCES dept_categories(id);
ALTER TABLE departments ADD COLUMN block_id bigint REFERENCES clinical_blocks(id);
ALTER TABLE empl ADD COLUMN block_id bigint REFERENCES clinical_blocks(id);
ALTER TABLE empl ADD COLUMN category_id bigint REFERENCES dept_categories(id);

-- Клінічні = 13 відділень з lsmd.admission_department
-- Хірургічний: Хірургія №1/2, Урологія, Опікове, Нейрохірургія, Травма дорослих/дітей
-- Терапевтичний: Терапія №1/2, Неврологія, Гастро, Гематологія
-- Інтенсивна: Анестезіологія
