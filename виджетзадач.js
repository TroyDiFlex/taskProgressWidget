// ==UserScript==
// @name         Task Progress Widget
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Виджет отслеживания прогресса задач
// @author       TroyDiflex
// @match        *://centiman.avito.ru/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Конфигурация по умолчанию
    const defaultConfig = {
        startHour: 17,
        startMinute: 0,
        endHour: 1,
        endMinute: 0,
        tasksPerHour: 110,
        interval: 30,
        showBreaks: false,
        breaks: [{ hour: 0, minute: 0, duration: 30 }],
        collapsed: false,
        minimized: false,
        widgetPosition: { x: 50, y: 50 },
        iconPosition: { x: window.innerWidth - 60, y: 20 },
        viewMode: 'current' // 'current' или 'all'
    };

    // Загрузка сохраненных настроек
    let config = JSON.parse(localStorage.getItem('taskWidgetConfig')) || { ...defaultConfig };

    // Инициализация переменных
    let isDragging = false;
    let isIconDragging = false;
    let wasIconDragged = false;
    let dragOffset = { x: 0, y: 0 };
    let currentOffset = { x: 0, y: 0 };
    let breaksCount = config.breaks.length || 1;

    // Добавление CSS стилей для кастомных элементов
    function addCustomStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* Кастомный чекбокс */
            .custom-checkbox {
                position: relative;
                display: inline-block;
                width: 18px;
                height: 18px;
                margin-right: 8px;
                vertical-align: middle;
            }
            .custom-checkbox input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .checkbox-label {
                position: absolute;
                top: 0;
                left: 0;
                width: 18px;
                height: 18px;
                background: #333;
                border: 2px solid #555;
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .custom-checkbox input:checked + .checkbox-label {
                background: #8a2be2;
                border-color: #8a2be2;
            }
            .custom-checkbox input:checked + .checkbox-label::after {
                content: '';
                position: absolute;
                left: 5px;
                top: 2px;
                width: 5px;
                height: 10px;
                border: solid white;
                border-width: 0 2px 2px 0;
                transform: rotate(45deg);
            }
            .custom-checkbox:hover .checkbox-label {
                border-color: #8a2be2;
            }

            /* Кастомный select */
            .custom-select {
                position: relative;
                width: 100%;
            }
            .custom-select select {
                display: none;
            }
            .select-selected {
                background: #333;
                border: 1px solid #555;
                border-radius: 6px;
                padding: 8px 12px;
                color: white;
                cursor: pointer;
                user-select: none;
                transition: all 0.2s ease;
                font-size: 11px;
            }
            .select-selected:hover {
                border-color: #8a2be2;
                background: #3a3a3a;
            }
            .select-selected::after {
                position: absolute;
                content: '';
                top: 50%;
                right: 12px;
                width: 0;
                height: 0;
                border: 5px solid transparent;
                border-color: #8a2be2 transparent transparent transparent;
                transform: translateY(-50%);
            }
            .select-selected.select-arrow-active::after {
                border-color: transparent transparent #8a2be2 transparent;
                top: 40%;
            }
            .select-items {
                position: absolute;
                background: #333;
                top: 100%;
                left: 0;
                right: 0;
                z-index: 99999;
                border: 1px solid #555;
                border-radius: 6px;
                margin-top: 4px;
                max-height: 200px;
                overflow-y: auto;
            }
            .select-item {
                padding: 8px 12px;
                color: white;
                cursor: pointer;
                transition: background 0.2s ease;
                font-size: 11px;
            }
            .select-item:hover {
                background: #8a2be2;
            }
            .select-hide {
                display: none;
            }
            .select-items div.select-item.select-same-as-selected {
                background: #8a2be2;
            }

            /* Убираем стрелочки в number input */
            input[type="number"]::-webkit-outer-spin-button,
            input[type="number"]::-webkit-inner-spin-button {
                -webkit-appearance: none;
                margin: 0;
            }
            input[type="number"] {
                -moz-appearance: textfield;
            }

            /* Убираем outline и белые полосы */
            input[type="number"]:focus {
                outline: none;
            }
            input[type="number"] {
                border: 1px solid #555;
                -webkit-appearance: none;
                -moz-appearance: textfield;
                box-shadow: none !important;
                border-top: 1px solid #555 !important;
            }
            input[type="number"]:focus {
                border-color: #8a2be2 !important;
                border-top-color: #8a2be2 !important;
            }
            input[type="number"]:-webkit-autofill {
                -webkit-box-shadow: 0 0 0 1000px #333 inset !important;
                box-shadow: 0 0 0 1000px #333 inset !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Создание элементов
    function createWidget() {
        // Добавляем кастомные стили
        addCustomStyles();

        // Создаем значок для свернутого состояния
        const widgetIcon = document.createElement('div');
        widgetIcon.id = 'taskWidgetIcon';
        widgetIcon.style.cssText = `
            position: fixed;
            z-index: 999999;
            width: 40px;
            height: 40px;
            background: linear-gradient(135deg, #333 0%, #2a2a2a 100%);
            border-radius: 50%;
            display: ${config.collapsed ? 'flex' : 'none'};
            align-items: center;
            justify-content: center;
            cursor: move;
            box-shadow: 0 4px 15px rgba(138, 43, 226, 0.3);
            border: 2px solid #8a2be2;
            color: white;
            font-weight: bold;
            user-select: none;
            font-size: 14px;
            transition: all 0.3s ease;
        `;
        widgetIcon.innerHTML = 'T';
        widgetIcon.style.left = `${config.iconPosition.x}px`;
        widgetIcon.style.top = `${config.iconPosition.y}px`;
        widgetIcon.addEventListener('mouseenter', function () {
            this.style.transform = 'scale(1.1)';
            this.style.boxShadow = '0 6px 20px rgba(138, 43, 226, 0.5)';
        });
        widgetIcon.addEventListener('mouseleave', function () {
            this.style.transform = 'scale(1)';
            this.style.boxShadow = '0 4px 15px rgba(138, 43, 226, 0.3)';
        });
        document.body.appendChild(widgetIcon);

        // Создаем основное окно виджета
        const widget = document.createElement('div');
        widget.id = 'taskWidget';
        widget.style.cssText = `
            position: fixed;
            z-index: 999998;
            width: ${config.minimized ? '200px' : '320px'};
            background: linear-gradient(135deg, #2a2a2a 0%, #1f1f1f 100%);
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(138, 43, 226, 0.1);
            display: ${config.collapsed ? 'none' : 'block'};
            overflow: visible;
            border: 1px solid rgba(138, 43, 226, 0.2);
            user-select: none;
            font-size: 12px;
            transition: all 0.3s ease;
        `;
        widget.style.left = `${config.widgetPosition.x}px`;
        widget.style.top = `${config.widgetPosition.y}px`;
        document.body.appendChild(widget);

        // Заголовок с кнопками
        const header = document.createElement('div');
        header.style.cssText = `
            background: linear-gradient(135deg, #333 0%, #2a2a2a 100%);
            padding: 10px 14px;
            cursor: move;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid rgba(138, 43, 226, 0.2);
            border-radius: 12px 12px 0 0;
        `;

        const title = document.createElement('div');
        title.textContent = 'Прогресс задач';
        title.style.cssText = `
            color: white;
            font-weight: 600;
            font-size: 14px;
            letter-spacing: 0.3px;
        `;

        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.cssText = `
            display: flex;
            gap: 6px;
            align-items: center;
        `;

        const minimizeBtn = document.createElement('button');
        minimizeBtn.innerHTML = '−';
        minimizeBtn.style.cssText = `
            background: transparent;
            color: #8a2be2;
            border: 1px solid #8a2be2;
            width: 24px;
            height: 24px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        `;
        minimizeBtn.addEventListener('mouseenter', function () {
            this.style.background = '#8a2be2';
            this.style.color = 'white';
            this.style.transform = 'scale(1.1)';
        });
        minimizeBtn.addEventListener('mouseleave', function () {
            this.style.background = 'transparent';
            this.style.color = '#8a2be2';
            this.style.transform = 'scale(1)';
        });

        const closeBtn = document.createElement('button');
        closeBtn.innerHTML = '×';
        closeBtn.style.cssText = `
            background: transparent;
            color: #ff4444;
            border: 1px solid #ff4444;
            width: 24px;
            height: 24px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 20px;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
        `;
        closeBtn.addEventListener('mouseenter', function () {
            this.style.background = '#ff4444';
            this.style.color = 'white';
            this.style.transform = 'scale(1.1)';
        });
        closeBtn.addEventListener('mouseleave', function () {
            this.style.background = 'transparent';
            this.style.color = '#ff4444';
            this.style.transform = 'scale(1)';
        });

        buttonsContainer.appendChild(minimizeBtn);
        buttonsContainer.appendChild(closeBtn);
        header.appendChild(title);
        header.appendChild(buttonsContainer);
        widget.appendChild(header);

        // Контейнер для настроек
        const settingsContainer = document.createElement('div');
        settingsContainer.id = 'widgetSettings';
        settingsContainer.style.cssText = `
            padding: 14px;
            overflow: visible;
            display: ${config.minimized ? 'none' : 'block'};
            transition: all 0.3s ease;
        `;
        widget.appendChild(settingsContainer);

        // Контейнер для отображения результатов
        const resultsContainer = document.createElement('div');
        resultsContainer.id = 'widgetResults';
        resultsContainer.style.cssText = `
            padding: 14px;
            background: linear-gradient(135deg, #222 0%, #1a1a1a 100%);
            border-top: 1px solid rgba(138, 43, 226, 0.2);
            max-height: 300px;
            overflow-y: auto;
            border-radius: 0 0 12px 12px;
        `;
        widget.appendChild(resultsContainer);

        // Инициализация интерфейса
        createSettingsUI(settingsContainer);
        createResultsUI(resultsContainer);

        // Обработчики событий
        setupEventListeners(widget, widgetIcon, minimizeBtn, closeBtn);

        // Начальный расчет
        updateResults();
    }

    // Инициализация кастомного select
    function initCustomSelect(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return;

        const customSelect = select.closest('.custom-select');
        if (!customSelect) return;

        const selectSelected = customSelect.querySelector('.select-selected');
        const selectItems = customSelect.querySelector('.select-items');
        const selectOptions = selectItems.querySelectorAll('.select-item');

        // Устанавливаем начальное значение
        const selectedOption = select.options[select.selectedIndex];
        selectSelected.textContent = selectedOption.textContent;

        // Обработчик клика на выбранный элемент
        selectSelected.addEventListener('click', function (e) {
            e.stopPropagation();
            const isCurrentlyHidden = selectItems.classList.contains('select-hide');
            // Закрываем все другие select
            document.querySelectorAll('.select-items').forEach(item => {
                if (item !== selectItems) {
                    item.classList.add('select-hide');
                }
            });
            document.querySelectorAll('.select-selected').forEach(sel => {
                if (sel !== selectSelected) {
                    sel.classList.remove('select-arrow-active');
                }
            });
            // Переключаем текущий select
            if (isCurrentlyHidden) {
                selectItems.classList.remove('select-hide');
                selectSelected.classList.add('select-arrow-active');
            } else {
                selectItems.classList.add('select-hide');
                selectSelected.classList.remove('select-arrow-active');
            }
        });

        // Обработчики для опций
        selectOptions.forEach(option => {
            option.addEventListener('click', function (e) {
                e.stopPropagation();
                const value = this.dataset.value;
                select.value = value;
                selectSelected.textContent = this.textContent;

                // Обновляем визуальное выделение
                selectOptions.forEach(opt => opt.classList.remove('select-same-as-selected'));
                this.classList.add('select-same-as-selected');

                selectItems.classList.add('select-hide');
                selectSelected.classList.remove('select-arrow-active');

                // Вызываем событие change
                const event = new Event('change');
                select.dispatchEvent(event);
            });
        });

        // Предотвращаем закрытие при клике внутри select-items
        selectItems.addEventListener('click', function (e) {
            e.stopPropagation();
        });

        // Обработчик изменения select
        select.addEventListener('change', function () {
            config.viewMode = this.value;
            saveConfig();
            updateResults();
        });
    }

    // Закрытие всех открытых select (кроме указанного)
    function closeAllSelects(excludeElement) {
        document.querySelectorAll('.select-items').forEach(item => {
            if (item !== excludeElement) {
                item.classList.add('select-hide');
            }
        });
        document.querySelectorAll('.select-selected').forEach(selected => {
            if (excludeElement && selected.closest('.custom-select') === excludeElement.closest('.custom-select')) {
                return; // Не закрываем текущий select
            }
            selected.classList.remove('select-arrow-active');
        });
    }

    // Закрытие select при клике вне его
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.custom-select')) {
            closeAllSelects();
        }
    });

    // Создание интерфейса настроек
    function createSettingsUI(container) {
        // Время начала и окончания смены в одной строке
        const timeRow = document.createElement('div');
        timeRow.style.cssText = `
            display: flex;
            gap: 8px;
            margin-bottom: 10px;
        `;

        // Начало смены
        const startDiv = document.createElement('div');
        startDiv.style.flex = '1';
        startDiv.innerHTML = `
            <div style="color: #ddd; margin-bottom: 5px; font-size: 11px; font-weight: 500;">Начало:</div>
            <div style="display: flex; gap: 4px; align-items: center;">
                <input type="number" id="startTimeHour" value="${config.startHour.toString().padStart(2, '0')}"
                       min="0" max="23" style="width: 45px; padding: 6px; background: #333;
                       border: 1px solid #555; border-radius: 6px; color: white; text-align: center; font-size: 11px;
                       transition: all 0.2s ease;">
                <span style="color: #8a2be2; font-size: 14px; font-weight: bold;">:</span>
                <input type="number" id="startTimeMinute" value="${config.startMinute.toString().padStart(2, '0')}"
                       min="0" max="59" style="width: 45px; padding: 6px; background: #333;
                       border: 1px solid #555; border-radius: 6px; color: white; text-align: center; font-size: 11px;
                       transition: all 0.2s ease;">
            </div>
        `;
        // Добавляем hover эффекты для инпутов
        setTimeout(() => {
            const startHourInput = document.getElementById('startTimeHour');
            const startMinuteInput = document.getElementById('startTimeMinute');
            [startHourInput, startMinuteInput].forEach(input => {
                input.addEventListener('focus', function () {
                    this.style.borderColor = '#8a2be2';
                    this.style.background = '#3a3a3a';
                });
                input.addEventListener('blur', function () {
                    this.style.borderColor = '#555';
                    this.style.background = '#333';
                });
            });
        }, 100);

        // Окончание смены
        const endDiv = document.createElement('div');
        endDiv.style.flex = '1';
        endDiv.innerHTML = `
            <div style="color: #ddd; margin-bottom: 5px; font-size: 11px; font-weight: 500;">Окончание:</div>
            <div style="display: flex; gap: 4px; align-items: center;">
                <input type="number" id="endTimeHour" value="${config.endHour.toString().padStart(2, '0')}"
                       min="0" max="23" style="width: 45px; padding: 6px; background: #333;
                       border: 1px solid #555; border-radius: 6px; color: white; text-align: center; font-size: 11px;
                       transition: all 0.2s ease;">
                <span style="color: #8a2be2; font-size: 14px; font-weight: bold;">:</span>
                <input type="number" id="endTimeMinute" value="${config.endMinute.toString().padStart(2, '0')}"
                       min="0" max="59" style="width: 45px; padding: 6px; background: #333;
                       border: 1px solid #555; border-radius: 6px; color: white; text-align: center; font-size: 11px;
                       transition: all 0.2s ease;">
            </div>
        `;
        // Добавляем hover эффекты для инпутов
        setTimeout(() => {
            const endHourInput = document.getElementById('endTimeHour');
            const endMinuteInput = document.getElementById('endTimeMinute');
            [endHourInput, endMinuteInput].forEach(input => {
                input.addEventListener('focus', function () {
                    this.style.borderColor = '#8a2be2';
                    this.style.background = '#3a3a3a';
                });
                input.addEventListener('blur', function () {
                    this.style.borderColor = '#555';
                    this.style.background = '#333';
                });
            });
        }, 100);

        timeRow.appendChild(startDiv);
        timeRow.appendChild(endDiv);
        container.appendChild(timeRow);

        // Норма в час и Интервал в одной строке
        const tasksRow = document.createElement('div');
        tasksRow.style.cssText = `
            display: flex;
            gap: 8px;
            margin-bottom: 10px;
        `;

        // Норма в час
        const tasksPerHourDiv = document.createElement('div');
        tasksPerHourDiv.style.flex = '1';
        tasksPerHourDiv.innerHTML = `
            <div style="color: #ddd; margin-bottom: 5px; font-size: 11px; font-weight: 500;">Норма в час:</div>
            <input type="number" id="tasksPerHour" value="${config.tasksPerHour}"
                   style="width: 100%; padding: 6px; background: #333; border: 1px solid #555;
                   border-radius: 6px; color: white; text-align: center; font-size: 11px; transition: all 0.2s ease; box-sizing: border-box;">
        `;
        setTimeout(() => {
            const input = document.getElementById('tasksPerHour');
            input.addEventListener('focus', function () {
                this.style.borderColor = '#8a2be2';
                this.style.background = '#3a3a3a';
            });
            input.addEventListener('blur', function () {
                this.style.borderColor = '#555';
                this.style.background = '#333';
            });
        }, 100);

        // Интервал
        const intervalDiv = document.createElement('div');
        intervalDiv.style.flex = '1';
        intervalDiv.innerHTML = `
            <div style="color: #ddd; margin-bottom: 5px; font-size: 11px; font-weight: 500;">Интервал (мин.):</div>
            <input type="number" id="interval" value="${config.interval}"
                   style="width: 100%; padding: 6px; background: #333; border: 1px solid #555;
                   border-radius: 6px; color: white; text-align: center; font-size: 11px; transition: all 0.2s ease; box-sizing: border-box;">
        `;
        setTimeout(() => {
            const input = document.getElementById('interval');
            input.addEventListener('focus', function () {
                this.style.borderColor = '#8a2be2';
                this.style.background = '#3a3a3a';
            });
            input.addEventListener('blur', function () {
                this.style.borderColor = '#555';
                this.style.background = '#333';
            });
        }, 100);

        tasksRow.appendChild(tasksPerHourDiv);
        tasksRow.appendChild(intervalDiv);
        container.appendChild(tasksRow);

        // Кастомный чекбокс перерывов
        const breakCheckboxDiv = document.createElement('div');
        breakCheckboxDiv.style.marginBottom = '12px';
        breakCheckboxDiv.style.display = 'flex';
        breakCheckboxDiv.style.alignItems = 'center';
        breakCheckboxDiv.innerHTML = `
            <label class="custom-checkbox" style="display: flex; align-items: center; cursor: pointer;">
                <input type="checkbox" id="showBreaks" ${config.showBreaks ? 'checked' : ''}>
                <span class="checkbox-label"></span>
            </label>
            <span style="color: #ddd; font-size: 11px; cursor: pointer;" onclick="document.getElementById('showBreaks').click();">Включить перерывы</span>
        `;
        container.appendChild(breakCheckboxDiv);

        // Контейнер для перерывов
        const breaksContainer = document.createElement('div');
        breaksContainer.id = 'breaksContainer';
        breaksContainer.style.display = config.showBreaks ? 'block' : 'none';
        breaksContainer.style.marginBottom = '8px';
        container.appendChild(breaksContainer);

        // Обновление перерывов
        updateBreaksUI(breaksContainer);

        // Режим отображения с кастомным select
        const viewModeDiv = document.createElement('div');
        viewModeDiv.style.marginBottom = '8px';
        viewModeDiv.innerHTML = `
            <div style="color: #ddd; margin-bottom: 5px; font-size: 11px; font-weight: 500;">Режим отображения:</div>
            <div class="custom-select" style="width: 100%;">
                <select id="viewMode">
                    <option value="current" ${config.viewMode === 'current' ? 'selected' : ''}>Текущий интервал</option>
                    <option value="all" ${config.viewMode === 'all' ? 'selected' : ''}>Все интервалы</option>
                </select>
                <div class="select-selected">${config.viewMode === 'current' ? 'Текущий интервал' : 'Все интервалы'}</div>
                <div class="select-items select-hide">
                    <div class="select-item" data-value="current">Текущий интервал</div>
                    <div class="select-item" data-value="all">Все интервалы</div>
                </div>
            </div>
        `;
        container.appendChild(viewModeDiv);

        // Инициализация кастомного select
        setTimeout(() => {
            initCustomSelect('viewMode');
        }, 100);

        // Обработчики изменений
        setTimeout(() => {
            const showBreaksCheckbox = document.getElementById('showBreaks');
            if (showBreaksCheckbox) {
                showBreaksCheckbox.addEventListener('change', function () {
                    config.showBreaks = this.checked;
                    breaksContainer.style.display = this.checked ? 'block' : 'none';
                    saveConfig();
                    updateResults();
                });
            }

            document.getElementById('tasksPerHour').addEventListener('input', function () {
                config.tasksPerHour = parseInt(this.value) || 110;
                saveConfig();
                updateResults();
            });

            document.getElementById('interval').addEventListener('input', function () {
                config.interval = parseInt(this.value) || 30;
                saveConfig();
                updateResults();
            });
        }, 100);

        // Обработчики времени
        ['startTimeHour', 'startTimeMinute', 'endTimeHour', 'endTimeMinute'].forEach(id => {
            document.getElementById(id).addEventListener('input', function () {
                if (id.includes('start')) {
                    if (id.includes('Hour')) {
                        config.startHour = parseInt(this.value) || 0;
                    } else {
                        config.startMinute = parseInt(this.value) || 0;
                    }
                } else {
                    if (id.includes('Hour')) {
                        config.endHour = parseInt(this.value) || 0;
                    } else {
                        config.endMinute = parseInt(this.value) || 0;
                    }
                }
                saveConfig();
                updateResults();
            });
        });
    }

    // Обновление интерфейса перерывов
    function updateBreaksUI(container) {
        container.innerHTML = '';

        config.breaks.forEach((breakItem, index) => {
            const breakDiv = document.createElement('div');
            breakDiv.style.marginBottom = '8px';
            breakDiv.style.padding = '10px';
            breakDiv.style.background = 'linear-gradient(135deg, #333 0%, #2a2a2a 100%)';
            breakDiv.style.borderRadius = '8px';
            breakDiv.style.border = '1px solid rgba(138, 43, 226, 0.1)';

            const hourValue = breakItem.hour.toString().padStart(2, '0');
            const minuteValue = breakItem.minute.toString().padStart(2, '0');

            breakDiv.innerHTML = `
                <div style="color: #ddd; font-size: 10px; margin-bottom: 6px; font-weight: 500;">Перерыв ${index + 1}:</div>
                <div style="display: flex; gap: 4px; align-items: center; margin-bottom: 6px; font-size: 10px; flex-wrap: wrap;">
                    <div style="color: #bbb;">Начало:</div>
                    <input type="number" class="breakHour" data-index="${index}" value="${hourValue}"
                           min="0" max="23" style="width: 42px; padding: 4px; background: #444;
                           border: 1px solid #555; border-radius: 6px; color: white; text-align: center; font-size: 10px;
                           transition: all 0.2s ease;">
                    <span style="color: #8a2be2; font-weight: bold;">:</span>
                    <input type="number" class="breakMinute" data-index="${index}" value="${minuteValue}"
                           min="0" max="59" style="width: 42px; padding: 4px; background: #444;
                           border: 1px solid #555; border-radius: 6px; color: white; text-align: center; font-size: 10px;
                           transition: all 0.2s ease;">
                    <div style="color: #bbb; margin-left: 4px;">Длит.:</div>
                    <input type="number" class="breakDuration" data-index="${index}" value="${breakItem.duration}"
                           min="1" style="width: 42px; padding: 4px; background: #444;
                           border: 1px solid #555; border-radius: 6px; color: white; text-align: center; font-size: 10px;
                           transition: all 0.2s ease;">
                    <span style="color: #bbb;">мин.</span>
                </div>
                ${index > 0 ? `
                    <button class="removeBreak" data-index="${index}"
                            style="background: transparent; color: #ff4444; border: 1px solid #ff4444;
                            padding: 4px 8px; border-radius: 6px; cursor: pointer; font-size: 10px;
                            transition: all 0.2s ease;">
                        Удалить
                    </button>
                ` : ''}
            `;
            container.appendChild(breakDiv);
        });

        // Кнопка добавления перерыва
        const addButton = document.createElement('button');
        addButton.textContent = '+ Добавить перерыв';
        addButton.style.cssText = `
            background: transparent;
            color: #8a2be2;
            border: 1px solid #8a2be2;
            padding: 8px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 11px;
            width: 100%;
            transition: all 0.2s ease;
            font-weight: 500;
        `;
        addButton.addEventListener('mouseenter', function () {
            this.style.background = '#8a2be2';
            this.style.color = 'white';
            this.style.transform = 'translateY(-1px)';
        });
        addButton.addEventListener('mouseleave', function () {
            this.style.background = 'transparent';
            this.style.color = '#8a2be2';
            this.style.transform = 'translateY(0)';
        });
        addButton.addEventListener('click', function () {
            config.breaks.push({ hour: 0, minute: 0, duration: 30 });
            saveConfig();
            updateBreaksUI(container);
            updateResults();
        });
        container.appendChild(addButton);

        // Обработчики для полей перерывов
        setTimeout(() => {
            container.querySelectorAll('.breakHour, .breakMinute, .breakDuration').forEach(input => {
                input.addEventListener('focus', function () {
                    this.style.borderColor = '#8a2be2';
                    this.style.background = '#555';
                });
                input.addEventListener('blur', function () {
                    this.style.borderColor = '#555';
                    this.style.background = '#444';
                });
                input.addEventListener('input', function () {
                    const index = parseInt(this.dataset.index);
                    if (this.classList.contains('breakHour')) {
                        config.breaks[index].hour = parseInt(this.value) || 0;
                    } else if (this.classList.contains('breakMinute')) {
                        config.breaks[index].minute = parseInt(this.value) || 0;
                    } else if (this.classList.contains('breakDuration')) {
                        config.breaks[index].duration = parseInt(this.value) || 30;
                    }
                    saveConfig();
                    updateResults();
                });
            });

            container.querySelectorAll('.removeBreak').forEach(button => {
                button.addEventListener('mouseenter', function () {
                    this.style.background = '#ff4444';
                    this.style.color = 'white';
                });
                button.addEventListener('mouseleave', function () {
                    this.style.background = 'transparent';
                    this.style.color = '#ff4444';
                });
                button.addEventListener('click', function () {
                    const index = parseInt(this.dataset.index);
                    config.breaks.splice(index, 1);
                    saveConfig();
                    updateBreaksUI(container);
                    updateResults();
                });
            });
        }, 100);
    }

    // Создание интерфейса результатов
    function createResultsUI(container) {
        container.innerHTML = `
            <div id="currentResult" style="color: white; font-size: 11px;">
                Расчет...
            </div>
            <div id="allResults" style="display: none;">
                <div style="color: #8a2be2; font-size: 12px; font-weight: 600; margin-bottom: 8px;
                     border-bottom: 1px solid rgba(138, 43, 226, 0.2); padding-bottom: 6px; letter-spacing: 0.3px;">
                    Все интервалы:
                </div>
                <div id="intervalsList" style="color: #bbb; font-size: 10px;"></div>
            </div>
        `;
    }

    // Настройка обработчиков событий
    function setupEventListeners(widget, widgetIcon, minimizeBtn, closeBtn) {
        // Минимизация (скрыть настройки, показать только результаты)
        minimizeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            config.minimized = !config.minimized;
            const settingsContainer = document.getElementById('widgetSettings');
            if (settingsContainer) {
                const currentWidth = config.minimized ? 320 : 200;
                const newWidth = config.minimized ? 200 : 320;
                const widthDiff = currentWidth - newWidth;

                // Корректируем позицию чтобы правый край оставался на месте
                const currentLeft = parseFloat(widget.style.left) || config.widgetPosition.x;
                const newLeft = currentLeft + widthDiff;

                widget.style.left = `${newLeft}px`;
                config.widgetPosition.x = newLeft;

                if (config.minimized) {
                    settingsContainer.style.display = 'none';
                    widget.style.width = '200px';
                } else {
                    settingsContainer.style.display = 'block';
                    widget.style.width = '320px';
                }
            }
            saveConfig();
        });

        // Закрытие (сворачивание в иконку)
        closeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            config.collapsed = true;
            widget.style.display = 'none';
            widgetIcon.style.display = 'flex';
            saveConfig();
        });

        // Развернуть из иконки (только если не было перетаскивания)
        widgetIcon.addEventListener('click', function (e) {
            if (wasIconDragged) {
                wasIconDragged = false;
                return;
            }
            config.collapsed = false;
            widget.style.display = 'block';
            widgetIcon.style.display = 'none';
            saveConfig();
        });

        // Перемещение виджета
        const widgetHeader = widget.querySelector('div');
        widgetHeader.addEventListener('mousedown', startDragging);
        widgetIcon.addEventListener('mousedown', startIconDragging);

        document.addEventListener('mousemove', handleDragging);
        document.addEventListener('mouseup', stopDragging);

        // Автообновление каждую минуту
        setInterval(updateResults, 60000);
    }

    // Функции для перетаскивания
    function startDragging(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;

        isDragging = true;
        const widget = document.getElementById('taskWidget');
        const rect = widget.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;
        currentOffset.x = rect.left;
        currentOffset.y = rect.top;

        widget.style.transition = 'none';
    }

    function startIconDragging(e) {
        isIconDragging = true;
        wasIconDragged = false;
        const icon = document.getElementById('taskWidgetIcon');
        const rect = icon.getBoundingClientRect();
        dragOffset.x = e.clientX - rect.left;
        dragOffset.y = e.clientY - rect.top;
        currentOffset.x = rect.left;
        currentOffset.y = rect.top;

        icon.style.transition = 'none';
    }

    function handleDragging(e) {
        if (!isDragging && !isIconDragging) return;

        if (isDragging) {
            const widget = document.getElementById('taskWidget');
            const x = e.clientX - dragOffset.x;
            const y = e.clientY - dragOffset.y;

            widget.style.left = `${x}px`;
            widget.style.top = `${y}px`;

            config.widgetPosition = { x, y };
        }

        if (isIconDragging) {
            wasIconDragged = true;
            const icon = document.getElementById('taskWidgetIcon');
            const x = e.clientX - dragOffset.x;
            const y = e.clientY - dragOffset.y;

            icon.style.left = `${x}px`;
            icon.style.top = `${y}px`;

            config.iconPosition = { x, y };
        }

        // Сохраняем позицию в реальном времени
        saveConfig();
    }

    function stopDragging() {
        if (isDragging || isIconDragging) {
            isDragging = false;
            isIconDragging = false;

            const widget = document.getElementById('taskWidget');
            const icon = document.getElementById('taskWidgetIcon');

            if (widget) widget.style.transition = 'left 0.2s, top 0.2s';
            if (icon) icon.style.transition = 'left 0.2s, top 0.2s';
        }
    }

    // Расчет времени в минутах
    function timeToMinutes(hour, minute) {
        return hour * 60 + minute;
    }

    // Проверка, находится ли время в перерыве
    function isDuringBreak(minutes, breaks) {
        if (!config.showBreaks) return false;

        for (const breakItem of breaks) {
            const breakStart = timeToMinutes(breakItem.hour, breakItem.minute);
            const breakEnd = breakStart + breakItem.duration;

            // Учитываем переход через полночь
            const startMinutes = timeToMinutes(config.startHour, config.startMinute);
            let adjustedBreakStart = breakStart;
            let adjustedMinutes = minutes;

            if (breakStart < startMinutes) {
                adjustedBreakStart += 24 * 60;
            }
            if (minutes < startMinutes) {
                adjustedMinutes += 24 * 60;
            }

            if (adjustedMinutes >= adjustedBreakStart && adjustedMinutes < adjustedBreakStart + breakItem.duration) {
                return true;
            }
        }
        return false;
    }

    // Расчет количества задач
    function calculateTasks() {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const startMinutes = timeToMinutes(config.startHour, config.startMinute);
        const endMinutes = timeToMinutes(config.endHour, config.endMinute);

        // Корректировка времени окончания (если раньше начала)
        let adjustedEndMinutes = endMinutes;
        if (endMinutes <= startMinutes) {
            adjustedEndMinutes += 24 * 60;
        }

        // Расчет общего рабочего времени
        let totalWorkMinutes = adjustedEndMinutes - startMinutes;

        // Вычитаем перерывы
        if (config.showBreaks) {
            config.breaks.forEach(breakItem => {
                totalWorkMinutes -= breakItem.duration;
            });
        }

        const totalWorkHours = totalWorkMinutes / 60;
        const totalTasks = Math.round(totalWorkHours * config.tasksPerHour);

        // Расчет для текущего интервала
        let adjustedCurrentMinutes = currentMinutes;
        if (currentMinutes < startMinutes) {
            adjustedCurrentMinutes += 24 * 60;
        }

        // Находим следующий интервал
        const minutesFromStart = adjustedCurrentMinutes - startMinutes;
        const intervals = Math.ceil(minutesFromStart / config.interval);
        const nextIntervalEnd = startMinutes + intervals * config.interval;

        // Если следующий интервал после окончания смены
        if (nextIntervalEnd > adjustedEndMinutes) {
            return {
                nextIntervalTasks: totalTasks,
                nextIntervalTime: null,
                totalTasks,
                intervalsList: []
            };
        }

        // Расчет времени до следующего интервала
        let workMinutes = nextIntervalEnd - startMinutes;

        // Вычитаем перерывы до этого времени
        if (config.showBreaks) {
            config.breaks.forEach(breakItem => {
                const breakStart = timeToMinutes(breakItem.hour, breakItem.minute);
                let adjustedBreakStart = breakStart;

                if (breakStart < startMinutes) {
                    adjustedBreakStart += 24 * 60;
                }

                if (adjustedBreakStart < nextIntervalEnd) {
                    const breakEnd = Math.min(adjustedBreakStart + breakItem.duration, nextIntervalEnd);
                    const breakDuration = Math.max(0, breakEnd - adjustedBreakStart);
                    workMinutes -= breakDuration;
                }
            });
        }

        const workHours = workMinutes / 60;
        const nextIntervalTasks = Math.round(workHours * config.tasksPerHour);

        // Форматирование времени следующего интервала
        let nextHour = Math.floor((nextIntervalEnd % (24 * 60)) / 60);
        let nextMinute = nextIntervalEnd % 60;

        // Расчет всех интервалов
        const intervalsList = [];
        for (let i = 1; i * config.interval <= totalWorkMinutes + (config.breaks.reduce((a, b) => a + b.duration, 0) || 0); i++) {
            const intervalEnd = startMinutes + i * config.interval;
            if (intervalEnd > adjustedEndMinutes) break;

            let intervalWorkMinutes = intervalEnd - startMinutes;

            // Вычитаем перерывы до этого интервала
            if (config.showBreaks) {
                config.breaks.forEach(breakItem => {
                    const breakStart = timeToMinutes(breakItem.hour, breakItem.minute);
                    let adjustedBreakStart = breakStart;

                    if (breakStart < startMinutes) {
                        adjustedBreakStart += 24 * 60;
                    }

                    if (adjustedBreakStart < intervalEnd) {
                        const breakEnd = Math.min(adjustedBreakStart + breakItem.duration, intervalEnd);
                        const breakDuration = Math.max(0, breakEnd - adjustedBreakStart);
                        intervalWorkMinutes -= breakDuration;
                    }
                });
            }

            const intervalWorkHours = intervalWorkMinutes / 60;
            const intervalTasks = Math.round(intervalWorkHours * config.tasksPerHour);

            const hour = Math.floor((intervalEnd % (24 * 60)) / 60);
            const minute = intervalEnd % 60;

            intervalsList.push({
                time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
                tasks: intervalTasks
            });
        }

        return {
            nextIntervalTasks,
            nextIntervalTime: `${nextHour.toString().padStart(2, '0')}:${nextMinute.toString().padStart(2, '0')}`,
            totalTasks,
            intervalsList
        };
    }

    // Обновление отображения результатов
    function updateResults() {
        const result = calculateTasks();
        const currentResult = document.getElementById('currentResult');
        const allResults = document.getElementById('allResults');
        const intervalsList = document.getElementById('intervalsList');

        if (config.viewMode === 'current') {
            allResults.style.display = 'none';
            currentResult.style.display = 'block';

            if (result.nextIntervalTime) {
                currentResult.innerHTML = `
                    <div style="color: #8a2be2; font-weight: 600; margin-bottom: 8px; font-size: 12px; letter-spacing: 0.3px;">
                        К ${result.nextIntervalTime} должно быть:
                    </div>
                    <div style="font-size: 20px; font-weight: 700; color: white; margin-bottom: 6px;
                         text-shadow: 0 0 10px rgba(138, 43, 226, 0.3);">
                        ${result.nextIntervalTasks} задач
                    </div>
                    <div style="color: #aaa; font-size: 10px; padding-top: 6px; border-top: 1px solid rgba(138, 43, 226, 0.1);">
                        Всего за смену: <span style="color: #8a2be2; font-weight: 600;">${result.totalTasks}</span> задач
                    </div>
                `;
            } else {
                currentResult.innerHTML = `
                    <div style="color: #8a2be2; font-weight: 600; margin-bottom: 8px; font-size: 12px; letter-spacing: 0.3px;">
                        Смена завершена
                    </div>
                    <div style="font-size: 20px; font-weight: 700; color: white; margin-bottom: 4px;
                         text-shadow: 0 0 10px rgba(138, 43, 226, 0.3);">
                        ${result.totalTasks} задач всего
                    </div>
                `;
            }
        } else {
            currentResult.style.display = 'none';
            allResults.style.display = 'block';

            let intervalsHtml = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px;">';
            result.intervalsList.forEach((interval, index) => {
                intervalsHtml += `
                    <div style="display: flex; justify-content: space-between; align-items: center;
                         padding: 3px 6px; background: rgba(138, 43, 226, 0.05); border-radius: 4px; font-size: 10px;">
                        <span style="color: #ddd;">${interval.time}</span>
                        <span style="color: #8a2be2; font-weight: 700; font-size: 11px; margin-left: 6px;">${interval.tasks}</span>
                    </div>
                `;
            });
            intervalsHtml += '</div>';

            intervalsList.innerHTML = intervalsHtml;
        }
    }

    // Сохранение конфигурации
    function saveConfig() {
        localStorage.setItem('taskWidgetConfig', JSON.stringify(config));
    }

    // Инициализация
    createWidget();

    // Обновление позиции при изменении размера окна
    window.addEventListener('resize', function () {
        const icon = document.getElementById('taskWidgetIcon');
        if (icon) {
            // Поддержание значка в пределах экрана
            const maxX = window.innerWidth - 40;
            const maxY = window.innerHeight - 40;

            config.iconPosition.x = Math.min(config.iconPosition.x, maxX);
            config.iconPosition.y = Math.min(config.iconPosition.y, maxY);

            icon.style.left = `${config.iconPosition.x}px`;
            icon.style.top = `${config.iconPosition.y}px`;

            saveConfig();
        }
    });

})();

