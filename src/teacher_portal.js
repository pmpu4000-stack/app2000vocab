/**
 * ════════════════════════════════════════════════════════════════════
 * teacher_portal.js - 教師教學管理專區模組
 * 包含：
 * 1. 每日測驗線上挑選單字出題 (Teacher Task Picker)
 * 2. 學生使用時間與宵禁限制管理 (Time Management)
 * 3. 個別學生學習歷程即時調閱 (Student Portfolio Inspector)
 * 4. 全班指定日期區間練習成效分析 (Class Range Analytics)
 * 5. 4 大功能方塊原位工作區切換 (Inline Workspace)
 * ════════════════════════════════════════════════════════════════════
 */

(function(window, document) {
  'use strict';

  const scriptUrl = window.__SCRIPT_URL || "https://script.google.com/macros/s/AKfycbx1hyCNJxqFMoaJgIxfZqLYIYH00NegI1Yd8NJP6gRjqwOndWGkmr-H9tGvVwK_axM9/exec";
  const formatDateDash = (dt = new Date()) => {
    if (typeof window.formatDateDash === 'function') return window.formatDateDash(dt);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };

    // ════════════════════════════════════════════════════════════════════
    // 老師線上挑選單字出題 Modal 核心邏輯
    // ════════════════════════════════════════════════════════════════════
    let pickerWords = [];
    let pickerMeanings = {};
    let pickerSelectedWords = new Set();
    let pickerLevel = "all";
    let pickerSearch = "";

    async function loadPickerData() {
      if (pickerWords.length > 0) return;
      try {
        const cacheName = "spelling-vocab-cache-v1";
        let wJson = null, mJson = null;
        if (typeof window !== "undefined" && "caches" in window) {
          try {
            const cache = await caches.open(cacheName);
            const [cw, cm] = await Promise.all([
              cache.match("data/words2000.json"),
              cache.match("data/meanings.json")
            ]);
            if (cw) wJson = await cw.json();
            if (cm) mJson = await cm.json();
          } catch(_) {}
        }
        if (wJson) {
          pickerWords = wJson;
          if (mJson) pickerMeanings = mJson;
          return;
        }
        const [wRes, mRes] = await Promise.all([
          fetch("data/words2000.json"),
          fetch("data/meanings.json").catch(() => null)
        ]);
        pickerWords = await wRes.json();
        if (mRes && mRes.ok) {
          pickerMeanings = await mRes.json();
        }
      } catch (err) {
        console.error("載入單字庫失敗：", err);
      }
    }

    function renderPickerGrid() {
      const grid = document.getElementById("t-word-grid");
      if (!grid) return;
      if (pickerWords.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:15px;color:#94a3b8;">載入單字庫中...</div>';
        return;
      }

      const q = pickerSearch.trim().toLowerCase();
      const filtered = pickerWords.filter(item => {
        const w = (item.w || "").toLowerCase();
        const lv = String(item.lv);
        if (pickerLevel !== "all" && lv !== String(pickerLevel)) return false;
        if (!q) return true;
        const m = pickerMeanings[item.w] || pickerMeanings[w] || {};
        const zh = (m.zh || "").toLowerCase();
        return w.includes(q) || zh.includes(q);
      });

      if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:15px;color:#94a3b8;">無符合條件的單字</div>';
        return;
      }

      grid.innerHTML = filtered.slice(0, 300).map(item => {
        const w = item.w;
        const isChecked = pickerSelectedWords.has(w.toLowerCase());
        const m = pickerMeanings[item.w] || pickerMeanings[w.toLowerCase()] || {};
        const zh = m.zh ? m.zh.split(/[,;，；]/)[0].substring(0, 10) : "";
        return `
          <label class="picker-word-item ${isChecked ? 'is-checked' : ''}" style="display:flex; align-items:center; gap:6px; padding:4px 8px; border-radius:6px; cursor:pointer; font-size:12.5px; user-select:none; transition:all 0.15s;">
            <input type="checkbox" value="${w.toLowerCase()}" ${isChecked ? 'checked' : ''} onchange="togglePickerWord('${w.toLowerCase()}')" style="accent-color:#6366f1; width:15px; height:15px; cursor:pointer;">
            <span style="font-weight:700;">${w}</span>
            ${zh ? `<span style="font-size:11px; opacity:0.75; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${zh}</span>` : ''}
          </label>
        `;
      }).join("");
    }

    window.togglePickerWord = function(word) {
      if (pickerSelectedWords.has(word)) {
        pickerSelectedWords.delete(word);
      } else {
        pickerSelectedWords.add(word);
      }
      updatePickerPreview();
      renderPickerGrid();
    };

    function updatePickerPreview() {
      const badge = document.getElementById("t-modal-count-badge");
      const previewCount = document.getElementById("t-preview-count");
      const tagsBox = document.getElementById("t-preview-tags");
      const count = pickerSelectedWords.size;

      if (badge) badge.textContent = `已選取 ${count} 個單字`;
      if (previewCount) previewCount.textContent = count;

      if (tagsBox) {
        if (count === 0) {
          tagsBox.innerHTML = '<span style="color:#64748b; font-size:12px;">尚未選取任何單字</span>';
        } else {
          tagsBox.innerHTML = Array.from(pickerSelectedWords).map(w => `
            <span style="display:inline-flex; align-items:center; gap:4px; background:#312e81; color:#c7d2fe; border:1px solid #4338ca; border-radius:4px; padding:2px 8px; font-size:11.5px;">
              ${w}
              <button onclick="togglePickerWord('${w}')" style="background:none; border:none; color:#f87171; cursor:pointer; padding:0 2px; font-weight:bold; font-size:12px;">&times;</button>
            </span>
          `).join("");
        }
      }
    }

    function getDefaultTaskName(dateStr) {
      if (!dateStr) {
        const now = new Date();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${m}-${d}指定單字測驗`;
      }
      const parts = dateStr.split("-");
      if (parts.length >= 3) {
        const m = String(parts[1]).padStart(2, '0');
        const d = String(parts[2]).padStart(2, '0');
        return `${m}-${d}指定單字測驗`;
      }
      return `${dateStr}指定單字測驗`;
    }

    function populateTeacherClassOptions() {
      const targetEl = document.getElementById("t-modal-class-container") || document.getElementById("t-modal-class-select");
      if (!targetEl) return;
      
      let savedClasses = [];
      try {
        const raw = localStorage.getItem("teacher_class_list");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) savedClasses = parsed;
        }
      } catch(_) {}
      
      const myClass = (localStorage.getItem("teacher_my_class") || "").replace(/班$/, "").trim();
      
      // 收集該老師所有任教班級，排除非任教班級
      const teacherClassSet = new Set();
      savedClasses.forEach(c => {
        if (c && c !== "all") teacherClassSet.add(String(c).replace(/班$/, "").trim());
      });
      if (myClass && myClass !== "all") {
        teacherClassSet.add(myClass);
      }

      const targetClasses = Array.from(teacherClassSet).sort();
      let html = "";
      
      // 改為勾選框清單：任教多班時支援同時勾選批次發布
      if (targetClasses.length > 0) {
        if (targetClasses.length > 1) {
          html += `<div style="width:100%; display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
            <span style="font-size:11.5px; color:#5A6183; font-weight:600;">已勾選目標班級：</span>
            <button type="button" id="t-btn-toggle-all-classes" onclick="toggleAllTaskClasses()" style="font-size:11px; padding:2px 7px; border-radius:5px; border:1px solid #c7d2fe; background:#eef2ff; color:#4338ca; cursor:pointer; font-weight:700;">全選 / 全取消</button>
          </div>`;
        }
        html += `<div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">`;
        targetClasses.forEach(c => {
          html += `<label class="task-class-chip" style="display:inline-flex; align-items:center; gap:5px; padding:4px 9px; border-radius:7px; border:1.5px solid #c7d2fe; background:#ffffff; font-size:13px; font-weight:700; color:#1e1b4b; cursor:pointer; user-select:none;">
            <input type="checkbox" name="task_target_classes" value="${c}" checked style="accent-color:#4f46e5; width:15px; height:15px; cursor:pointer;">
            🏫 ${c} 班
          </label>`;
        });
        html += `</div>`;
      } else {
        html = `<label class="task-class-chip" style="display:inline-flex; align-items:center; gap:5px; padding:4px 9px; border-radius:7px; border:1.5px solid #c7d2fe; background:#ffffff; font-size:13px; font-weight:700; color:#1e1b4b; cursor:pointer;">
          <input type="checkbox" name="task_target_classes" value="all" checked style="accent-color:#4f46e5; width:15px; height:15px; cursor:pointer;">
          🌐 全校 / 所有班級
        </label>`;
      }

      if (targetEl.tagName === "SELECT") {
        const wrapper = document.createElement("div");
        wrapper.id = "t-modal-class-container";
        wrapper.style.width = "100%";
        wrapper.innerHTML = html;
        targetEl.parentNode.replaceChild(wrapper, targetEl);
      } else {
        targetEl.innerHTML = html;
      }

      const customInp = document.getElementById("t-modal-class-custom");
      if (customInp) customInp.style.display = "none";
    }

    window.toggleAllTaskClasses = function() {
      const cbs = document.querySelectorAll("input[name='task_target_classes']");
      if (cbs.length === 0) return;
      const allChecked = Array.from(cbs).every(cb => cb.checked);
      cbs.forEach(cb => { cb.checked = !allChecked; });
    };

    window.openTeacherModal = function() {
      const modal = document.getElementById("teacherTaskModal");
      if (!modal) return;
      modal.style.display = "flex";
      const todayDash = formatDateDash();
      const dateInp = document.getElementById("t-modal-date");
      if (dateInp && !dateInp.value) {
        dateInp.value = todayDash;
      }
      populateTeacherClassOptions();
      
      // 任務名稱預設為 mm-dd指定單字測驗
      const nameInp = document.getElementById("t-modal-name");
      if (nameInp) {
        const dVal = (dateInp && dateInp.value) ? dateInp.value : todayDash;
        nameInp.value = getDefaultTaskName(dVal);
      }

      loadPickerData().then(() => {
        renderPickerGrid();
        updatePickerPreview();
      });
    };

    window.closeTeacherModal = function() {
      const modal = document.getElementById("teacherTaskModal");
      if (modal) modal.style.display = "none";
    };

    function initPickerEvents() {
      ensureTeacherModalsMounted();

      const openBtn = document.getElementById("btn-teacher-picker");
      if (openBtn) openBtn.onclick = window.openTeacherModal;

      const closeBtn = document.getElementById("btnCloseTeacherModal");
      if (closeBtn) closeBtn.onclick = window.closeTeacherModal;

      // 日期變更時自動同步任務名稱為 mm-dd指定單字測驗
      const dateInp = document.getElementById("t-modal-date");
      if (dateInp) {
        dateInp.onchange = () => {
          const nameInp = document.getElementById("t-modal-name");
          if (nameInp) {
            nameInp.value = getDefaultTaskName(dateInp.value);
          }
        };
      }

      // 班級下拉選單切換
      const classSel = document.getElementById("t-modal-class-select");
      const customInp = document.getElementById("t-modal-class-custom");
      if (classSel && customInp) {
        classSel.onchange = () => {
          if (classSel.value === "custom") {
            customInp.style.display = "block";
            customInp.focus();
          } else {
            customInp.style.display = "none";
          }
        };
      }

      // 篩選標籤
      document.querySelectorAll(".btn-picker-chip").forEach(btn => {
        btn.onclick = () => {
          document.querySelectorAll(".btn-picker-chip").forEach(b => {
            b.classList.remove("active");
            b.style.background = "#1e293b";
            b.style.borderColor = "#475569";
            b.style.color = "#cbd5e1";
          });
          btn.classList.add("active");
          btn.style.background = "#6366f1";
          btn.style.borderColor = "#6366f1";
          btn.style.color = "#fff";
          pickerLevel = btn.dataset.lv;
          renderPickerGrid();
        };
      });

      // 搜尋
      const searchInp = document.getElementById("t-modal-search");
      if (searchInp) {
        searchInp.oninput = () => {
          pickerSearch = searchInp.value;
          renderPickerGrid();
        };
      }

      // 隨機抽取 10 字
      const r10Btn = document.getElementById("t-btn-random10");
      if (r10Btn) {
        r10Btn.onclick = () => {
          const pool = pickerWords.filter(item => pickerLevel === "all" || String(item.lv) === String(pickerLevel));
          const shuffled = [...pool].sort(() => 0.5 - Math.random());
          shuffled.slice(0, 10).forEach(item => pickerSelectedWords.add((item.w || "").toLowerCase()));
          updatePickerPreview();
          renderPickerGrid();
        };
      }

      // 隨機抽取 20 字
      const r20Btn = document.getElementById("t-btn-random20");
      if (r20Btn) {
        r20Btn.onclick = () => {
          const pool = pickerWords.filter(item => pickerLevel === "all" || String(item.lv) === String(pickerLevel));
          const shuffled = [...pool].sort(() => 0.5 - Math.random());
          shuffled.slice(0, 20).forEach(item => pickerSelectedWords.add((item.w || "").toLowerCase()));
          updatePickerPreview();
          renderPickerGrid();
        };
      }

      // 全選本組
      const selAllBtn = document.getElementById("t-btn-selectall");
      if (selAllBtn) {
        selAllBtn.onclick = () => {
          const pool = pickerWords.filter(item => pickerLevel === "all" || String(item.lv) === String(pickerLevel));
          pool.forEach(item => pickerSelectedWords.add((item.w || "").toLowerCase()));
          updatePickerPreview();
          renderPickerGrid();
        };
      }

      // 清空
      const clearBtn = document.getElementById("t-btn-clear");
      if (clearBtn) {
        clearBtn.onclick = () => {
          pickerSelectedWords.clear();
          updatePickerPreview();
          renderPickerGrid();
        };
      }

      // 發布至試算表
      const pubBtn = document.getElementById("t-btn-publish");
      if (pubBtn) {
        pubBtn.onclick = async () => {
          if (pickerSelectedWords.size === 0) {
            alert("請至少勾選 1 個單字！");
            return;
          }
          const currentUser = localStorage.getItem("current_user");
          const currentPass = sessionStorage.getItem("current_pass") || localStorage.getItem("current_pass") || "";
          
          // 取得所有勾選的班級
          const checkedCbs = document.querySelectorAll("input[name='task_target_classes']:checked");
          let targetClasses = Array.from(checkedCbs).map(cb => cb.value);
          if (targetClasses.length === 0) {
            // fallback 若存在傳統 select
            const selClass = document.getElementById("t-modal-class-select");
            if (selClass && selClass.value) targetClasses = [selClass.value];
          }
          if (targetClasses.length === 0) {
            alert("請至少勾選 1 個目標班級！");
            return;
          }

          const todayDash = formatDateDash();
          const dateInp = document.getElementById("t-modal-date");
          const targetDate = (dateInp && dateInp.value ? dateInp.value : todayDash).trim() || todayDash;
          const taskName = (document.getElementById("t-modal-name").value || "每日指定單字測驗").trim();
          const mode = document.getElementById("t-modal-mode").value;
          const count = document.getElementById("t-modal-count").value;
          const wordsStr = Array.from(pickerSelectedWords).join(", ");
          const msgEl = document.getElementById("t-modal-msg");

          msgEl.textContent = `正在發布至 ${targetClasses.length} 個班級...`;
          pubBtn.disabled = true;

          try {
            const publishPromises = targetClasses.map(cls => {
              return fetch(scriptUrl, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({
                  action: "saveTeacherTask",
                  username: currentUser,
                  password: currentPass,
                  taskData: {
                    targetDate: targetDate,
                    date: targetDate,
                    className: cls,
                    taskName: taskName,
                    words: wordsStr,
                    mode: mode,
                    count: count,
                    enabled: true
                  }
                })
              }).then(r => r.json());
            });

            const results = await Promise.all(publishPromises);
            const allSuccess = results.every(res => res && res.status === "success");

            if (allSuccess) {
              const classNamesStr = targetClasses.map(c => c === "all" ? "全校" : c + " 班").join("、");
              alert("🎉 發布成功！\n指定測驗日期：" + targetDate + "\n目標班級：" + classNamesStr + "\n任務名稱：" + taskName + "\n單字數量：" + pickerSelectedWords.size + " 字\n\n學生於該指定日期登入時即可進行純聽拼測驗！");
              closeTeacherModal();
            } else {
              const failed = results.filter(res => !res || res.status !== "success");
              alert("部分班級發布失敗，請重試！");
              msgEl.textContent = "部分班級發布失敗。";
            }
          } catch(err) {
            console.error(err);
            alert("連線失敗，請檢查網路。");
            msgEl.textContent = "連線失敗。";
          } finally {
            pubBtn.disabled = false;
          }
        };
      }

      // 立即以此單字開始測驗 (預覽)
      const previewRunBtn = document.getElementById("t-btn-preview-run");
      if (previewRunBtn) {
        previewRunBtn.onclick = () => {
          if (pickerSelectedWords.size === 0) {
            alert("請至少勾選 1 個單字！");
            return;
          }
          const taskName = (document.getElementById("t-modal-name").value || "今日指定測驗 (預覽)").trim();
          const mode = document.getElementById("t-modal-mode").value;
          const count = (mode === "全考") ? "ALL" : document.getElementById("t-modal-count").value;
          const wordsArr = Array.from(pickerSelectedWords);

          const taskObj = {
            hasTask: true,
            taskName: taskName,
            words: wordsArr,
            total: wordsArr.length,
            mode: mode === "全考" ? "ALL" : "SAMPLE",
            count: count
          };

          sessionStorage.setItem("assigned_task", JSON.stringify(taskObj));
          localStorage.setItem("assigned_task_active", JSON.stringify(taskObj));
          const ds1 = formatDateSlash();
          const ds2 = formatDateDash();
          localStorage.removeItem("task_done_" + ds1);
          localStorage.removeItem("task_done_" + ds2);
          closeTeacherModal();

          // 重新整理遊戲狀態並展示今日測驗歡迎卡
          if (typeof window.triggerDailyTaskIntro === "function") {
            window.triggerDailyTaskIntro(taskObj);
          } else {
            location.reload();
          }
        };
      }
    }


    window.openTimeModal = function() {
      const modal = document.getElementById("timeManagementModal");
      if (!modal) return;
      modal.style.display = "flex";

      const todayDash = formatDateDash();
      const sInp = document.getElementById("tm-input-start");
      const eInp = document.getElementById("tm-input-end");
      if (sInp && !sInp.value) sInp.value = todayDash;
      if (eInp && !eInp.value) eInp.value = todayDash;

      const limitTabBtn = document.getElementById("tm-tab-btn-limit");
      if (limitTabBtn) limitTabBtn.click();

      loadTimeRestrictions();
    };

    window.closeTimeModal = function() {
      const modal = document.getElementById("timeManagementModal");
      if (modal) modal.style.display = "none";
    };

    window.openTimeManagementModal = window.openTimeModal;
    window.closeTimeManagementModal = window.closeTimeModal;

    let currentTimeStatus = null;
    let timeGlobalData = null;
    let timeStudentRules = [];
    let timeDateRules = [];
    let allStudentsList = [];

    async function loadTimeRestrictions() {
      const currentUser = localStorage.getItem("current_user");
      const currentPass = sessionStorage.getItem("current_pass") || localStorage.getItem("current_pass") || "";
      const statusEl = document.getElementById("tm-today-status-badge");
      const dateListEl = document.getElementById("tm-rules-list");
      const studentListEl = document.getElementById("tm-student-rules-list");
      const toggleBtn = document.getElementById("tm-btn-quick-toggle");

      if (statusEl) statusEl.textContent = "讀取最新狀態中...";
      if (dateListEl) dateListEl.innerHTML = `<div style="text-align:center; padding:15px; color:#64748b; font-size:13px;">讀取中...</div>`;
      if (studentListEl) studentListEl.innerHTML = `<div style="text-align:center; padding:15px; color:#64748b; font-size:13px;">讀取中...</div>`;

      try {
        const res = await fetch(scriptUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            action: "getTimeRestrictions",
            username: currentUser,
            password: currentPass
          })
        });
        const data = await res.json();
        if (data.status === "success") {
          currentTimeStatus = data.currentStatus || {};
          timeGlobalData = data.globalTime || { startTime: "07:30", endTime: "22:00" };
          timeStudentRules = data.studentRules || [];
          timeDateRules = data.dateRules || [];
          allStudentsList = data.studentList || [];

          // 1. 全域預設時間帶入（預設為上次修改之設定）
          const gStartInp = document.getElementById("tm-global-start");
          const gEndInp = document.getElementById("tm-global-end");
          const gUpdateEl = document.getElementById("tm-global-last-updated");
          if (gStartInp && timeGlobalData.startTime) gStartInp.value = timeGlobalData.startTime;
          if (gEndInp && timeGlobalData.endTime) gEndInp.value = timeGlobalData.endTime;
          if (gUpdateEl) {
            const upd = timeGlobalData.updatedAt ? `上次更新：${timeGlobalData.updatedAt} (${timeGlobalData.teacher || "教師"})` : "目前套用預設值";
            gUpdateEl.textContent = upd;
          }

          // 1.5 每日時長上限設定帶入
          if (data.dailyUsage) {
            const defM = data.dailyUsage.defaultMinutes || 10;
            const defSel = document.getElementById("tm-limit-default-minutes");
            if (defSel) defSel.value = String(defM);
            const curDisplay = document.getElementById("tm-limit-current-display");
            if (curDisplay) curDisplay.textContent = `目前全校預設：${defM} 分鐘`;
          }

          // 2. 學生名冊選單帶入
          populateStudentSelectOptions();

          // 3. 渲染個別學生清單
          renderStudentRulesList();

          // 4. 今日特別狀態與快捷切換按鈕
          if (statusEl) {
            if (currentTimeStatus.isOverridden) {
              const oName = currentTimeStatus.activeDateOverride ? currentTimeStatus.activeDateOverride.name : "特別開放";
              statusEl.innerHTML = `<span style="color:#10b981; font-weight:bold;">🎉 今日已解除時間限制（${oName}，全天開放）</span>`;
            } else if (isTimeWithinDailyAllowed()) {
              statusEl.innerHTML = `<span style="color:#38bdf8; font-weight:bold;">🟢 依預設時段 (${timeGlobalData.startTime} ～ ${timeGlobalData.endTime}) 開放中</span>`;
            } else {
              statusEl.innerHTML = `<span style="color:#f87171; font-weight:bold;">🌙 目前非開放時段 (預設開放：${timeGlobalData.startTime} ～ ${timeGlobalData.endTime})</span>`;
            }
          }

          if (toggleBtn) {
            if (currentTimeStatus.isOverridden) {
              toggleBtn.textContent = "🔴 恢復今日標準限制";
              toggleBtn.style.background = "#ef4444";
            } else {
              toggleBtn.textContent = "⚡ 一鍵解除今日限制 (今日全天開放)";
              toggleBtn.style.background = "#10b981";
            }
          }

          // 5. 渲染特別日期清單
          renderDateRulesList();
        }
      } catch(err) {
        console.error(err);
        if (statusEl) statusEl.textContent = "連線失敗，請檢查網路";
      }
    }

    function populateStudentSelectOptions() {
      const classFilter = document.getElementById("tm-student-class-filter");
      const limitClassFilter = document.getElementById("tm-limit-class-filter");
      const studentSelect = document.getElementById("tm-student-select");
      if (!studentSelect) return;

      const classSet = new Set();
      allStudentsList.forEach(s => {
        if (s.className) classSet.add(s.className);
      });
      const sortedClasses = Array.from(classSet).sort();

      if (classFilter) {
        const curClass = classFilter.value || "all";
        let cHtml = `<option value="all">所有班級 (${allStudentsList.length} 人)</option>`;
        sortedClasses.forEach(c => {
          cHtml += `<option value="${c}" ${c === curClass ? "selected" : ""}>${c} 班</option>`;
        });
        classFilter.innerHTML = cHtml;
      }

      if (limitClassFilter) {
        const curLClass = limitClassFilter.value || "all";
        let lcHtml = `<option value="all">所有班級 (${allStudentsList.length} 人)</option>`;
        sortedClasses.forEach(c => {
          lcHtml += `<option value="${c}" ${c === curLClass ? "selected" : ""}>${c} 班</option>`;
        });
        limitClassFilter.innerHTML = lcHtml;
      }

      filterStudentDropdown();
    }

    function filterStudentDropdown() {
      const classFilter = document.getElementById("tm-student-class-filter");
      const studentSelect = document.getElementById("tm-student-select");
      if (studentSelect) {
        const selectedClass = classFilter ? classFilter.value : "all";
        const filtered = (selectedClass === "all")
          ? allStudentsList
          : allStudentsList.filter(s => s.className === selectedClass);

        let html = `<option value="">-- 請選擇學生 (${filtered.length} 人) --</option>`;
        filtered.forEach(s => {
          const existingRule = timeStudentRules.find(r => r.username.toLowerCase() === s.username.toLowerCase());
          const star = existingRule ? ` ★ (${existingRule.startTime}~${existingRule.endTime})` : "";
          html += `<option value="${s.username}" data-name="${s.realName}" data-class="${s.className}">${s.username} ${s.realName} (${s.className}班)${star}</option>`;
        });
        studentSelect.innerHTML = html;
      }

      const limitClassFilter = document.getElementById("tm-limit-class-filter");
      const limitStudentSelect = document.getElementById("tm-limit-student-select");
      if (limitStudentSelect) {
        const selectedLClass = limitClassFilter ? limitClassFilter.value : "all";
        const filteredL = (selectedLClass === "all")
          ? allStudentsList
          : allStudentsList.filter(s => s.className === selectedLClass);

        let lHtml = `<option value="">-- 請選擇學生 (${filteredL.length} 人) --</option>`;
        filteredL.forEach(s => {
          lHtml += `<option value="${s.username}" data-name="${s.realName}" data-class="${s.className}">${s.username} ${s.realName} (${s.className}班)</option>`;
        });
        limitStudentSelect.innerHTML = lHtml;
      }
    }

    async function updateLimitStudentStatusCard() {
      const studentSel = document.getElementById("tm-limit-student-select");
      const box = document.getElementById("tm-limit-student-status-box");
      if (!studentSel || !box) return;
      const u = studentSel.value.trim();
      if (!u) {
        box.innerHTML = `<span style="color:#94a3b8;">請選擇學生以查看其今日練習時間與即時狀態</span>`;
        return;
      }
      box.innerHTML = `<span style="color:#38bdf8;">⏳ 正在查詢學生【${u}】今日練習時間與狀態...</span>`;
      try {
        const res = await fetch(scriptUrl, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "getDailyUsageSettings", username: u })
        });
        const d = await res.json();
        if (d.status === "success" && d.dailyUsage) {
          const du = d.dailyUsage;
          const totalM = du.limitMinutes + du.extendedMinutes;
          const statusTag = du.unlocked 
            ? `<span style="color:#10b981; font-weight:bold;">🔓 今日已解除時間限制 (不限時)</span>`
            : `<span style="color:#38bdf8; font-weight:bold;">⏱️ 今日總上限：${totalM} 分鐘</span>（基礎 ${du.limitMinutes} 分鐘 + 累計延長 ${du.extendedMinutes} 分鐘）`;
          
          const firstLoginStr = du.firstLoginTime ? new Date(du.firstLoginTime).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "今日尚未登入";

          box.innerHTML = `
            <div style="line-height:1.7;">
              <div style="color:#f1f5f9;">👤 <b>學生：</b>${u} | 🕒 <b>今日首次登入：</b><b style="color:#fbbf24;">${firstLoginStr}</b></div>
              <div>📌 <b>狀態：</b>${statusTag}</div>
            </div>
          `;
        } else {
          box.innerHTML = `<span style="color:#f87171;">無法取得學生狀態</span>`;
        }
      } catch(e) {
        box.innerHTML = `<span style="color:#f87171;">查詢連線失敗，請檢查網路</span>`;
      }
    }

    function renderStudentRulesList() {
      const listEl = document.getElementById("tm-student-rules-list");
      const countEl = document.getElementById("tm-student-rules-count");
      if (!listEl) return;

      if (!timeStudentRules || timeStudentRules.length === 0) {
        listEl.innerHTML = `<div style="text-align:center; padding:15px; color:#64748b; font-size:13px;">目前無任何個別學生特別時間，皆套用全校預設作答時間。</div>`;
        if (countEl) countEl.textContent = "共 0 位學生";
        return;
      }

      if (countEl) countEl.textContent = `共 ${timeStudentRules.length} 位學生`;

      let html = `<div style="display:flex; flex-direction:column; gap:6px;">`;
      timeStudentRules.forEach(r => {
        html += `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-radius:8px; border:1px solid #334155; background:#1e293b; gap:10px;">
            <div style="flex:1;">
              <div style="font-size:13px; font-weight:700; color:#f1f5f9; display:flex; align-items:center; gap:6px;">
                <span>👤 ${r.studentInfo || r.username}</span>
                <span style="font-size:11px; background:#065f46; color:#a7f3d0; padding:1px 6px; border-radius:4px;">專屬時段</span>
              </div>
              <div style="font-size:12px; color:#94a3b8; margin-top:2px;">
                ⏰ 可作答時間：<b style="color:#38bdf8;">${r.startTime} ～ ${r.endTime}</b>
                ${r.remark ? `<span style="margin-left:8px; color:#64748b;">(${r.remark})</span>` : ""}
              </div>
            </div>
            <button class="tm-btn-delete-student" data-user="${r.username}" style="padding:4px 9px; background:#ef4444; color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">
              🗑️ 移除
            </button>
          </div>
        `;
      });
      html += `</div>`;
      listEl.innerHTML = html;

      listEl.querySelectorAll(".tm-btn-delete-student").forEach(btn => {
        btn.onclick = async () => {
          const u = btn.dataset.user;
          if (!confirm(`確定要移除學生【${u}】的專屬時間設定，恢復為全校預設時間嗎？`)) return;

          const currentUser = localStorage.getItem("current_user");
          const currentPass = sessionStorage.getItem("current_pass") || localStorage.getItem("current_pass") || "";
          btn.textContent = "...";
          btn.disabled = true;

          try {
            const res = await fetch(scriptUrl, {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({
                action: "deleteStudentTimeSetting",
                username: currentUser,
                password: currentPass,
                targetUsername: u
              })
            });
            const d = await res.json();
            if (d.status === "success") {
              alert(d.message || "已成功移除！");
              loadTimeRestrictions();
            } else {
              alert("移除失敗：" + (d.message || ""));
              btn.textContent = "🗑️ 移除";
              btn.disabled = false;
            }
          } catch(err) {
            console.error(err);
            alert("連線失敗，請稍後再試");
            btn.textContent = "🗑️ 移除";
            btn.disabled = false;
          }
        };
      });
    }

    function renderDateRulesList() {
      const listEl = document.getElementById("tm-rules-list");
      if (!listEl) return;

      if (!timeDateRules || timeDateRules.length === 0) {
        listEl.innerHTML = `
          <div style="text-align:center; padding:15px; color:#64748b; font-size:13px;">
            目前尚無特別解除限制之日期設定。<br>
            每日將依設定之作答時段開放。
          </div>`;
        return;
      }

      const todayDash = formatDateDash();

      let html = `<div style="display:flex; flex-direction:column; gap:6px;">`;
      timeDateRules.forEach(r => {
        const isCurrent = (todayDash >= r.startDate && todayDash <= r.endDate);
        const borderStyle = isCurrent ? "border:1.5px solid #10b981; background:rgba(16,185,129,0.1);" : "border:1px solid #334155; background:#1e293b;";
        const activeBadge = isCurrent
          ? `<span style="background:#065f46; color:#a7f3d0; font-size:11px; padding:2px 6px; border-radius:4px; font-weight:bold;">今日生效中</span>`
          : (r.endDate < todayDash ? `<span style="background:#334155; color:#94a3b8; font-size:11px; padding:2px 6px; border-radius:4px;">已過期</span>` : `<span style="background:#1e3a8a; color:#bfdbfe; font-size:11px; padding:2px 6px; border-radius:4px;">即將到來</span>`);

        html += `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-radius:8px; ${borderStyle} gap:10px;">
            <div style="flex:1;">
              <div style="font-size:13px; font-weight:700; color:#f1f5f9; display:flex; align-items:center; gap:8px;">
                <span>${r.name}</span>
                ${activeBadge}
              </div>
              <div style="font-size:12px; color:#94a3b8; margin-top:2px;">
                📅 解除區間：<b style="color:#e2e8f0;">${r.startDate}</b> 至 <b style="color:#e2e8f0;">${r.endDate}</b>
                ${r.remark ? `<span style="margin-left:8px; color:#64748b;">(${r.remark})</span>` : ""}
              </div>
            </div>
            <button class="tm-btn-delete-rule" data-start="${r.startDate}" data-end="${r.endDate}" data-name="${r.name}" style="padding:4px 9px; background:#ef4444; color:#fff; border:none; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">
              🗑️ 刪除
            </button>
          </div>
        `;
      });
      html += `</div>`;
      listEl.innerHTML = html;

      listEl.querySelectorAll(".tm-btn-delete-rule").forEach(btn => {
        btn.onclick = async () => {
          const s = btn.dataset.start;
          const e = btn.dataset.end;
          const n = btn.dataset.name;
          if (!confirm(`確定要刪除【${n}】（${s} ~ ${e}）的解除限制設定嗎？`)) return;

          const currentUser = localStorage.getItem("current_user");
          const currentPass = sessionStorage.getItem("current_pass") || localStorage.getItem("current_pass") || "";
          btn.textContent = "...";
          btn.disabled = true;

          try {
            const res = await fetch(scriptUrl, {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({
                action: "deleteTimeRestriction",
                username: currentUser,
                password: currentPass,
                ruleData: { startDate: s, endDate: e }
              })
            });
            const d = await res.json();
            if (d.status === "success") {
              alert("已成功刪除解除限制設定！");
              loadTimeRestrictions();
            } else {
              alert("刪除失敗：" + (d.message || "未知原因"));
              btn.textContent = "🗑️ 刪除";
              btn.disabled = false;
            }
          } catch(err) {
            console.error(err);
            alert("連線失敗，請稍後再試");
            btn.textContent = "🗑️ 刪除";
            btn.disabled = false;
          }
        };
      });
    }

    function initTimeManagementEvents() {
      ensureTeacherModalsMounted();

      const openBtn = document.getElementById("btn-time-management");
      if (openBtn) openBtn.onclick = window.openTimeModal;

      const closeBtn = document.getElementById("btnCloseTimeModal");
      if (closeBtn) closeBtn.onclick = window.closeTimeModal;

      const refreshBtn = document.getElementById("tm-btn-refresh");
      if (refreshBtn) refreshBtn.onclick = loadTimeRestrictions;

      // 分頁切換
      const tabBtns = [
        { btn: "tm-tab-btn-limit", panel: "tm-tab-panel-limit" },
        { btn: "tm-tab-btn-global", panel: "tm-tab-panel-global" },
        { btn: "tm-tab-btn-student", panel: "tm-tab-panel-student" },
        { btn: "tm-tab-btn-date", panel: "tm-tab-panel-date" }
      ];
      tabBtns.forEach(t => {
        const b = document.getElementById(t.btn);
        if (b) {
          b.onclick = () => {
            tabBtns.forEach(other => {
              const ob = document.getElementById(other.btn);
              const op = document.getElementById(other.panel);
              if (ob) {
                ob.style.background = (other.btn === t.btn) ? "#3b82f6" : "#1e293b";
                ob.style.borderColor = (other.btn === t.btn) ? "#3b82f6" : "#475569";
                ob.style.color = (other.btn === t.btn) ? "#fff" : "#cbd5e1";
              }
              if (op) op.style.display = (other.panel === t.panel) ? "block" : "none";
            });
          };
        }
      });

      // 班級篩選切換
      const classFilter = document.getElementById("tm-student-class-filter");
      if (classFilter) {
        classFilter.onchange = filterStudentDropdown;
      }

      // 選擇學生時，若已有個別時間，自動填入輸入框；若無，帶入全校預設時間
      const studentSelect = document.getElementById("tm-student-select");
      if (studentSelect) {
        studentSelect.onchange = () => {
          const u = studentSelect.value;
          const sStartInp = document.getElementById("tm-student-start");
          const sEndInp = document.getElementById("tm-student-end");
          const sRemarkInp = document.getElementById("tm-student-remark");

          if (!u) return;
          const existing = timeStudentRules.find(r => r.username.toLowerCase() === u.toLowerCase());
          if (existing) {
            if (sStartInp) sStartInp.value = existing.startTime;
            if (sEndInp) sEndInp.value = existing.endTime;
            if (sRemarkInp) sRemarkInp.value = existing.remark || "";
          } else {
            if (sStartInp && timeGlobalData) sStartInp.value = timeGlobalData.startTime || "07:30";
            if (sEndInp && timeGlobalData) sEndInp.value = timeGlobalData.endTime || "22:00";
            if (sRemarkInp) sRemarkInp.value = "";
          }
        };
      }

      // 儲存全校預設作答時間
      const saveGlobalBtn = document.getElementById("tm-btn-save-global");
      if (saveGlobalBtn) {
        saveGlobalBtn.onclick = async () => {
          const sTime = document.getElementById("tm-global-start").value.trim();
          const eTime = document.getElementById("tm-global-end").value.trim();
          const msgEl = document.getElementById("tm-modal-msg");

          if (!sTime || !eTime) {
            alert("請選擇開始時間與結束時間！");
            return;
          }

          const currentUser = localStorage.getItem("current_user");
          const currentPass = sessionStorage.getItem("current_pass") || localStorage.getItem("current_pass") || "";
          saveGlobalBtn.textContent = "儲存中...";
          saveGlobalBtn.disabled = true;

          try {
            const res = await fetch(scriptUrl, {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({
                action: "saveGlobalTimeSetting",
                username: currentUser,
                password: currentPass,
                timeData: { startTime: sTime, endTime: eTime }
              })
            });
            const d = await res.json();
            if (d.status === "success") {
              alert(d.message || "全校預設作答時間已儲存！");
              loadTimeRestrictions();
            } else {
              alert("儲存失敗：" + (d.message || ""));
            }
          } catch(err) {
            console.error(err);
            alert("連線失敗，請稍後再試");
          } finally {
            saveGlobalBtn.textContent = "💾 儲存並套用全校預設作答時間";
            saveGlobalBtn.disabled = false;
          }
        };
      }

      // 儲存個別學生專屬時間
      const saveStudentBtn = document.getElementById("tm-btn-save-student");
      if (saveStudentBtn) {
        saveStudentBtn.onclick = async () => {
          const studentSel = document.getElementById("tm-student-select");
          const username = studentSel ? studentSel.value.trim() : "";
          const sTime = document.getElementById("tm-student-start").value.trim();
          const eTime = document.getElementById("tm-student-end").value.trim();
          const remark = document.getElementById("tm-student-remark").value.trim();

          if (!username) {
            alert("請先選擇要設定的學生！");
            return;
          }
          if (!sTime || !eTime) {
            alert("請選擇可作答開始時間與結束時間！");
            return;
          }

          const selOpt = studentSel.options[studentSel.selectedIndex];
          const studentInfo = selOpt ? selOpt.textContent.replace(/★.*$/, "").trim() : username;

          const currentUser = localStorage.getItem("current_user");
          const currentPass = sessionStorage.getItem("current_pass") || localStorage.getItem("current_pass") || "";
          saveStudentBtn.textContent = "儲存中...";
          saveStudentBtn.disabled = true;

          try {
            const res = await fetch(scriptUrl, {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({
                action: "saveStudentTimeSetting",
                username: currentUser,
                password: currentPass,
                studentData: {
                  username: username,
                  studentInfo: studentInfo,
                  startTime: sTime,
                  endTime: eTime,
                  remark: remark
                }
              })
            });
            const d = await res.json();
            if (d.status === "success") {
              alert(d.message || "學生專屬作答時間已成功設定！");
              loadTimeRestrictions();
            } else {
              alert("儲存失敗：" + (d.message || ""));
            }
          } catch(err) {
            console.error(err);
            alert("連線失敗，請稍後再試");
          } finally {
            saveStudentBtn.textContent = "💾 儲存該學生專屬作答時間";
            saveStudentBtn.disabled = false;
          }
        };
      }

      // 一鍵解除/恢復今日限制
      const toggleBtn = document.getElementById("tm-btn-quick-toggle");
      if (toggleBtn) {
        toggleBtn.onclick = async () => {
          const currentUser = localStorage.getItem("current_user");
          const currentPass = sessionStorage.getItem("current_pass") || localStorage.getItem("current_pass") || "";
          toggleBtn.textContent = "處理中...";
          toggleBtn.disabled = true;

          try {
            const res = await fetch(scriptUrl, {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({
                action: "quickToggleTodayUnlock",
                username: currentUser,
                password: currentPass
              })
            });
            const d = await res.json();
            if (d.status === "success") {
              alert(d.message || "今日解除設定更新成功！");
              loadTimeRestrictions();
            } else {
              alert("操作失敗：" + (d.message || ""));
            }
          } catch(err) {
            console.error(err);
            alert("連線失敗，請稍後再試");
          } finally {
            toggleBtn.disabled = false;
          }
        };
      }

      // 新增特別日期全天開放設定
      const saveDateBtn = document.getElementById("tm-btn-save-override");
      if (saveDateBtn) {
        saveDateBtn.onclick = async () => {
          const sInp = document.getElementById("tm-input-start");
          const eInp = document.getElementById("tm-input-end");
          const nInp = document.getElementById("tm-input-name");
          const msgEl = document.getElementById("tm-modal-msg");

          const startDate = sInp ? sInp.value.trim() : "";
          const endDate = eInp ? eInp.value.trim() : "";
          const name = (nInp && nInp.value.trim()) ? nInp.value.trim() : "特別開放";

          if (!startDate || !endDate) {
            alert("請選擇起始日期與結束日期！");
            return;
          }
          if (startDate > endDate) {
            alert("起始日期不得大於結束日期！");
            return;
          }

          const currentUser = localStorage.getItem("current_user");
          const currentPass = sessionStorage.getItem("current_pass") || localStorage.getItem("current_pass") || "";
          saveDateBtn.textContent = "儲存中...";
          saveDateBtn.disabled = true;
          if (msgEl) msgEl.textContent = "正在寫入試算表...";

          try {
            const res = await fetch(scriptUrl, {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({
                action: "saveTimeRestriction",
                username: currentUser,
                password: currentPass,
                ruleData: {
                  name: name,
                  startDate: startDate,
                  endDate: endDate,
                  enabled: true,
                  remark: "教師自訂特別日期"
                }
              })
            });
            const d = await res.json();
            if (d.status === "success") {
              alert(`✅ 設定成功！\n名稱：${name}\n解除區間：${startDate} ～ ${endDate}\n學生於該期間全天皆可使用。`);
              if (nInp) nInp.value = "";
              if (msgEl) msgEl.textContent = "";
              loadTimeRestrictions();
            } else {
              alert("儲存失敗：" + (d.message || ""));
              if (msgEl) msgEl.textContent = "儲存失敗：" + (d.message || "");
            }
          } catch(err) {
            console.error(err);
            alert("連線失敗，請稍後再試");
            if (msgEl) msgEl.textContent = "連線失敗";
          } finally {
            saveDateBtn.textContent = "💾 儲存並生效";
            saveDateBtn.disabled = false;
          }
        };
      }

      // ══════════════════════════════════════════
      // 分頁 4：每日使用時長與延長限制事件綁定
      // ══════════════════════════════════════════
      const limitClassFilter = document.getElementById("tm-limit-class-filter");
      if (limitClassFilter) {
        limitClassFilter.onchange = filterStudentDropdown;
      }

      const limitStudentSelect = document.getElementById("tm-limit-student-select");
      if (limitStudentSelect) {
        limitStudentSelect.onchange = updateLimitStudentStatusCard;
      }

      // 儲存全校預設時長
      const saveLimitBtn = document.getElementById("tm-btn-save-limit-minutes");
      if (saveLimitBtn) {
        saveLimitBtn.onclick = async () => {
          const selectEl = document.getElementById("tm-limit-default-minutes");
          const mins = parseInt(selectEl ? selectEl.value : 10, 10);
          const currentUser = localStorage.getItem("current_user");
          const currentPass = sessionStorage.getItem("current_pass") || localStorage.getItem("current_pass") || "";

          saveLimitBtn.disabled = true;
          saveLimitBtn.textContent = "儲存中...";
          try {
            const res = await fetch(scriptUrl, {
              method: "POST",
              headers: { "Content-Type": "text/plain;charset=utf-8" },
              body: JSON.stringify({
                action: "saveDailyMinutesSetting",
                username: currentUser,
                password: currentPass,
                settingData: { targetUser: "ALL", minutes: mins }
              })
            });
            const d = await res.json();
            if (d.status === "success") {
              alert(d.message || `已成功設定全校每日練習時間為 ${mins} 分鐘！`);
              const curDisp = document.getElementById("tm-limit-current-display");
              if (curDisp) curDisp.textContent = `目前全校預設：${mins} 分鐘`;
            } else {
              alert("儲存失敗：" + (d.message || ""));
            }
          } catch(err) {
            console.error(err);
            alert("連線失敗，請稍後再試");
          } finally {
            saveLimitBtn.disabled = false;
            saveLimitBtn.textContent = "💾 儲存全校預設時長";
          }
        };
      }

      // 輔助函式：執行加時
      async function triggerExtendUsageTime(targetUser, studentInfo, addMins, btnEl) {
        const currentUser = localStorage.getItem("current_user");
        const currentPass = sessionStorage.getItem("current_pass") || localStorage.getItem("current_pass") || "";
        const origText = btnEl ? btnEl.textContent : "";
        if (btnEl) {
          btnEl.disabled = true;
          btnEl.textContent = "處理中...";
        }

        try {
          const res = await fetch(scriptUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              action: "extendStudentUsageTime",
              username: currentUser,
              password: currentPass,
              extendData: { targetUser: targetUser, studentInfo: studentInfo, addMinutes: addMins }
            })
          });
          const d = await res.json();
          if (d.status === "success") {
            alert(d.message || `✅ 已成功為【${targetUser === "ALL" ? "全體學生" : targetUser}】延長 ${addMins} 分鐘！`);
            if (targetUser !== "ALL") {
              updateLimitStudentStatusCard();
            }
          } else {
            alert("加時失敗：" + (d.message || ""));
          }
        } catch(err) {
          console.error(err);
          alert("連線失敗，請稍後再試");
        } finally {
          if (btnEl) {
            btnEl.disabled = false;
            btnEl.textContent = origText;
          }
        }
      }

      // 輔助函式：切換解除限制
      async function triggerToggleUnlock(targetUser, studentInfo, unlock, btnEl) {
        const currentUser = localStorage.getItem("current_user");
        const currentPass = sessionStorage.getItem("current_pass") || localStorage.getItem("current_pass") || "";
        const origText = btnEl ? btnEl.textContent : "";
        if (btnEl) {
          btnEl.disabled = true;
          btnEl.textContent = "處理中...";
        }

        try {
          const res = await fetch(scriptUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              action: "toggleStudentDailyUnlock",
              username: currentUser,
              password: currentPass,
              unlockData: { targetUser: targetUser, studentInfo: studentInfo, unlocked: unlock }
            })
          });
          const d = await res.json();
          if (d.status === "success") {
            alert(d.message || `✅ 已成功${unlock ? "解除" : "恢復"}【${targetUser === "ALL" ? "全體學生" : targetUser}】時長限制！`);
            if (targetUser !== "ALL") {
              updateLimitStudentStatusCard();
            }
          } else {
            alert("操作失敗：" + (d.message || ""));
          }
        } catch(err) {
          console.error(err);
          alert("連線失敗，請稍後再試");
        } finally {
          if (btnEl) {
            btnEl.disabled = false;
            btnEl.textContent = origText;
          }
        }
      }

      function getSelectedStudent() {
        const sel = document.getElementById("tm-limit-student-select");
        if (!sel || !sel.value) {
          alert("請先選擇要操作的學生！");
          return null;
        }
        const opt = sel.options[sel.selectedIndex];
        return {
          username: sel.value,
          info: opt ? opt.textContent.trim() : sel.value
        };
      }

      const btnExt5 = document.getElementById("tm-btn-extend-5");
      if (btnExt5) {
        btnExt5.onclick = () => {
          const s = getSelectedStudent();
          if (s) triggerExtendUsageTime(s.username, s.info, 5, btnExt5);
        };
      }

      const btnExt10 = document.getElementById("tm-btn-extend-10");
      if (btnExt10) {
        btnExt10.onclick = () => {
          const s = getSelectedStudent();
          if (s) triggerExtendUsageTime(s.username, s.info, 10, btnExt10);
        };
      }

      const btnExt15 = document.getElementById("tm-btn-extend-15");
      if (btnExt15) {
        btnExt15.onclick = () => {
          const s = getSelectedStudent();
          if (s) triggerExtendUsageTime(s.username, s.info, 15, btnExt15);
        };
      }

      const btnUnlockStud = document.getElementById("tm-btn-unlock-student");
      if (btnUnlockStud) {
        btnUnlockStud.onclick = () => {
          const s = getSelectedStudent();
          if (s) triggerToggleUnlock(s.username, s.info, true, btnUnlockStud);
        };
      }

      const btnLockStud = document.getElementById("tm-btn-lock-student");
      if (btnLockStud) {
        btnLockStud.onclick = () => {
          const s = getSelectedStudent();
          if (s) triggerToggleUnlock(s.username, s.info, false, btnLockStud);
        };
      }

      const btnExtAll10 = document.getElementById("tm-btn-extend-all-10");
      if (btnExtAll10) {
        btnExtAll10.onclick = () => {
          if (!confirm("確定要為【全體學生】今日延長 10 分鐘練習時間嗎？")) return;
          triggerExtendUsageTime("ALL", "全體學生", 10, btnExtAll10);
        };
      }

      const btnUnlockAll = document.getElementById("tm-btn-unlock-all");
      if (btnUnlockAll) {
        btnUnlockAll.onclick = () => {
          if (!confirm("確定要為【全體學生】今日完全解除時間限制嗎？")) return;
          triggerToggleUnlock("ALL", "全體學生", true, btnUnlockAll);
        };
      }
    }

    async function initTeacherPortalInspector() {
      const classSel = document.getElementById("tp-class-select");
      const studentSel = document.getElementById("tp-student-select");
      const btnInspect = document.getElementById("tp-btn-inspect");
      const statusEl = document.getElementById("tp-inspect-status");
      if (!classSel || !studentSel || !btnInspect) return;

      async function ensureStudents() {
        if (allStudentsList && allStudentsList.length > 0) return allStudentsList;
        try {
          const u = localStorage.getItem("current_user");
          const p = sessionStorage.getItem("current_pass") || localStorage.getItem("current_pass") || "";
          const res = await fetch(scriptUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "getTimeRestrictions", username: u, password: p })
          });
          const d = await res.json();
          if (d.status === "success" && d.studentList) {
            allStudentsList = d.studentList;
          }
        } catch (_) {}
        return allStudentsList || [];
      }

      const list = await ensureStudents();
      if (!list || list.length === 0) {
        classSel.innerHTML = '<option value="">無班級資料</option>';
        return;
      }

      const cSet = new Set();
      list.forEach(s => {
        const c = String(s.className || "").trim();
        if (c) cSet.add(c);
      });
      const sortedClasses = Array.from(cSet).sort();
      classSel.innerHTML = '<option value="">-- 請選擇班級 --</option>' + 
        sortedClasses.map(c => `<option value="${c}">${c} 班</option>`).join("");

      classSel.onchange = () => {
        const selC = classSel.value;
        if (!selC) {
          studentSel.innerHTML = '<option value="">請先選擇班級</option>';
          return;
        }
        const filtered = list.filter(s => String(s.className || "").trim() === selC);
        studentSel.innerHTML = '<option value="">-- 請選擇學生 --</option>' + 
          filtered.map(s => `<option value="${s.username}">${s.username} - ${s.realName || "學生"}</option>`).join("");
      };

      btnInspect.onclick = async () => {
        const targetStudent = studentSel.value;
        if (!targetStudent) {
          alert("請先選擇要調閱的學生！");
          return;
        }
        btnInspect.disabled = true;
        btnInspect.style.opacity = "0.7";
        if (statusEl) {
          statusEl.style.display = "block";
          statusEl.innerHTML = `<span style="color:var(--sky)">⏳ 正在從歷程總庫載入學生【${targetStudent}】學習成果...</span>`;
        }

        try {
          const teacherUser = localStorage.getItem("current_user");
          const teacherPass = sessionStorage.getItem("current_pass") || localStorage.getItem("current_pass") || "";
          const res = await fetch(scriptUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              action: "login",
              username: teacherUser,
              password: teacherPass,
              targetStudent: targetStudent
            })
          });
          const result = await res.json();
          if (result.status === "success" && result.records) {
            for (let key in result.records) {
              if (key === "current_user" || key === "user_role" || key === "current_pass") continue;
              const val = result.records[key];
              const valToStore = (typeof val === "object" && val !== null) ? JSON.stringify(val) : String(val);
              localStorage.setItem(key, valToStore);
            }
            if (result.cachedSummary) {
              try {
                localStorage.setItem("cached_summary", JSON.stringify(result.cachedSummary));
                window.__CACHED_SUMMARY = result.cachedSummary;
              } catch(_) {}
            }

            document.body.classList.add("has-inspected", "show-student-records");
            document.documentElement.classList.add("has-inspected", "show-student-records");
            document.querySelectorAll("section.progress").forEach(el => el.style.setProperty("display", "block", "important"));

            const stuLabel = `${result.className ? result.className + ' ' : ''}${result.realName ? result.realName + '（' + targetStudent + '）' : targetStudent}`;
            if (statusEl) {
              statusEl.innerHTML = `<span style="color:#16a34a; font-weight:700;">✅ 已成功載入【${stuLabel}】完整學習成果，下方整體進度已即時呈現！</span>`;
            }

            // 同步記憶體 store 與進度渲染
            if (window.__store && typeof window.__store.reload === "function") {
              try { window.__store.reload(); } catch(_) {}
            }
            if (typeof window.refreshChrome === "function") {
              try { window.refreshChrome(); } catch(_) {}
            }
            if (typeof window.updateProgressDOMFromLocalStorage === "function") {
              try { window.updateProgressDOMFromLocalStorage(); } catch(_) {}
            }

            // 自動展開整體進度卡片並清楚標記受測學生姓名
            const bodyProg = document.getElementById("progress-collapsible-body");
            const btnProg = document.getElementById("btn-toggle-progress-card");
            const secProg = document.getElementById("progress-card");
            if (bodyProg) bodyProg.style.display = "block";
            if (secProg) secProg.classList.remove("is-collapsed");
            if (btnProg) btnProg.textContent = "收合";
            const titleSpan = secProg ? secProg.querySelector("h3 span:first-child") : null;
            if (titleSpan) titleSpan.innerHTML = `整體進度 Progress <span style="font-size:14px; color:var(--sky); font-weight:700; margin-left:8px;">【${stuLabel}】</span>`;

            if (window.renderSummaryCard) window.renderSummaryCard();
            if (window.renderLearningRecords) window.renderLearningRecords();
            if (window.renderConquerSection) window.renderConquerSection();
            if (window.renderWeakWords) window.renderWeakWords();
            if (window.renderExportRecords) window.renderExportRecords();

            const progCard = document.getElementById("progress-card");
            if (progCard) {
              progCard.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          } else {
            throw new Error(result.message || "未能取得學生資料");
          }
        } catch (err) {
          if (statusEl) {
            statusEl.innerHTML = `<span style="color:#ef4444; font-weight:700;">❌ 載入失敗：${err.message}</span>`;
          }
        } finally {
          btnInspect.disabled = false;
          btnInspect.style.opacity = "1";
        }
      };
    }

    window.switchTeacherTab = function(tabName) {
      const tabs = ["task", "time", "student", "class"];
      tabs.forEach(t => {
        const nav = document.getElementById("tp-nav-" + t);
        const panel = document.getElementById("tp-panel-" + t);
        if (nav) {
          if (t === tabName) nav.classList.add("active");
          else nav.classList.remove("active");
        }
        if (panel) {
          panel.style.display = (t === tabName) ? "block" : "none";
        }
      });

      // 只有在個人歷程 (student) 且已調閱學生時，才顯示下方的五大歷程方塊，其餘分頁 (task, time, class) 一律嚴格隱藏
      const progSections = document.querySelectorAll("section.progress");
      if (tabName === "student" && document.body.classList.contains("has-inspected")) {
        document.body.classList.add("show-student-records");
        document.documentElement.classList.add("show-student-records");
        progSections.forEach(el => el.style.setProperty("display", "block", "important"));
      } else {
        document.body.classList.remove("show-student-records");
        document.documentElement.classList.remove("show-student-records");
        progSections.forEach(el => el.style.setProperty("display", "none", "important"));
      }

      if (tabName === "task") {
        const todayDash = formatDateDash();
        const dateInp = document.getElementById("t-modal-date");
        if (dateInp && !dateInp.value) dateInp.value = todayDash;
        if (typeof populateTeacherClassOptions === "function") populateTeacherClassOptions();
        if (typeof loadPickerData === "function") {
          loadPickerData().then(() => {
            if (typeof renderPickerGrid === "function") renderPickerGrid();
            if (typeof updatePickerPreview === "function") updatePickerPreview();
          });
        }
      } else if (tabName === "time") {
        if (typeof loadTimeRestrictions === "function") loadTimeRestrictions();
      } else if (tabName === "student") {
        if (typeof initTeacherPortalInspector === "function") initTeacherPortalInspector();
      } else if (tabName === "class") {
        if (typeof initClassRangeAnalytics === "function") initClassRangeAnalytics();
      }
    };

    window.setCrDateShortcut = function(days) {
      const eDateInp = document.getElementById("cr-end-date");
      const sDateInp = document.getElementById("cr-start-date");
      const now = new Date();
      const past = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
      if (eDateInp) eDateInp.value = formatDateDash(now);
      if (sDateInp) sDateInp.value = formatDateDash(past);
    };

    function initClassRangeAnalytics() {
      const cSel = document.getElementById("cr-class-select");
      const sDateInp = document.getElementById("cr-start-date");
      const eDateInp = document.getElementById("cr-end-date");
      const btnQuery = document.getElementById("cr-btn-query");
      if (!cSel || !btnQuery) return;

      if (!sDateInp.value || !eDateInp.value) {
        setCrDateShortcut(7);
      }

      // 載入班級清單
      if (allStudentsList && allStudentsList.length > 0) {
        const cSet = new Set();
        allStudentsList.forEach(s => {
          const c = String(s.className || "").trim();
          if (c) cSet.add(c);
        });
        const sorted = Array.from(cSet).sort();
        const cur = cSel.value || "all";
        cSel.innerHTML = '<option value="all">🌐 全校 / 全部班級</option>' + 
          sorted.map(c => `<option value="${c}">${c} 班</option>`).join("");
        cSel.value = cur;
      }

      btnQuery.onclick = async () => {
        btnQuery.disabled = true;
        btnQuery.style.opacity = "0.7";
        btnQuery.textContent = "⏳ 查詢中...";
        const resBox = document.getElementById("cr-results-container");
        const tbody = document.getElementById("cr-students-tbody");

        try {
          const u = localStorage.getItem("current_user");
          const p = sessionStorage.getItem("current_pass") || localStorage.getItem("current_pass") || "";
          const res = await fetch(scriptUrl, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({
              action: "getDateRangePerformanceAnalytics",
              username: u,
              password: p,
              targetClass: cSel.value,
              startDate: sDateInp.value,
              endDate: eDateInp.value
            })
          });
          const data = await res.json();
          if (data.status === "success" && data.summary) {
            const sm = data.summary;
            if (resBox) resBox.style.display = "block";
            const kpiPart = document.getElementById("cr-kpi-part");
            const kpiPartSub = document.getElementById("cr-kpi-part-sub");
            const kpiAcc = document.getElementById("cr-kpi-acc");
            const kpiAtt = document.getElementById("cr-kpi-attempts");

            if (kpiPart) kpiPart.textContent = sm.participationRate;
            if (kpiPartSub) kpiPartSub.textContent = `${sm.activeStudents} / ${sm.totalStudents} 人實測`;
            if (kpiAcc) kpiAcc.textContent = sm.classAvgAccuracy;
            if (kpiAtt) kpiAtt.textContent = (sm.totalAttempts || 0).toLocaleString() + " 字";

            if (tbody && Array.isArray(data.studentRows)) {
              if (data.studentRows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="padding:16px; text-align:center; color:var(--ink2);">此區間尚無學生作答紀錄</td></tr>';
              } else {
                tbody.innerHTML = data.studentRows.map(r => {
                  const accColor = r.accuracy >= 85 ? "#16a34a" : r.accuracy >= 60 ? "var(--sky)" : "#ef4444";
                  const statusBg = r.status === "精熟" ? "rgba(22,163,74,0.1)" : r.status === "及格" ? "rgba(2,132,199,0.1)" : r.status === "未作答" ? "rgba(0,0,0,0.05)" : "rgba(239,68,68,0.1)";
                  const statusColor = r.status === "精熟" ? "#16a34a" : r.status === "及格" ? "var(--sky)" : r.status === "未作答" ? "var(--ink2)" : "#ef4444";
                  return `<tr style="border-bottom:1px solid var(--line);">
                    <td style="padding:10px 12px; font-weight:600;">${r.className || '-'} 班</td>
                    <td style="padding:10px 12px;"><b>${r.username}</b> <span style="color:var(--ink2); font-size:12px;">(${r.realName || '-'})</span></td>
                    <td style="padding:10px 12px; text-align:center;">${r.testedDays} 天</td>
                    <td style="padding:10px 12px; text-align:center; font-weight:700;">${r.attempts} 字</td>
                    <td style="padding:10px 12px; text-align:center; font-weight:800; color:${accColor};">${r.accuracy}%</td>
                    <td style="padding:10px 12px; text-align:center;"><span style="padding:3px 8px; border-radius:6px; font-size:12px; font-weight:700; background:${statusBg}; color:${statusColor};">${r.status}</span></td>
                  </tr>`;
                }).join("");
              }
            }
          } else {
            alert(data.message || "查詢失敗");
          }
        } catch (err) {
          alert("連線失敗：" + err.message);
        } finally {
          btnQuery.disabled = false;
          btnQuery.style.opacity = "1";
          btnQuery.textContent = "📊 查詢全班紀錄";
        }
      };
    }

    function initTeacherInlineWorkspace() {
      // 將 teacherTaskModal 和 timeManagementModal 動態移入主工作區 panel，原位顯示
      const pTask = document.getElementById("tp-panel-task");
      const mTask = document.getElementById("teacherTaskModal");
      if (pTask && mTask && mTask.parentElement !== pTask) {
        pTask.appendChild(mTask);
        mTask.style.display = "block";
      }

      const pTime = document.getElementById("tp-panel-time");
      const mTime = document.getElementById("timeManagementModal");
      if (pTime && mTime && mTime.parentElement !== pTime) {
        pTime.appendChild(mTime);
        mTime.style.display = "block";
      }

      switchTeacherTab("task");
    }


  // ════════════════════════════════════════════════════════════════════
  // 導出全域函式供 HTML 行內事件與其他模組調用
  // ════════════════════════════════════════════════════════════════════
  window.loadPickerData = loadPickerData;
  window.renderPickerGrid = renderPickerGrid;
  window.updatePickerPreview = updatePickerPreview;
  window.populateTeacherClassOptions = populateTeacherClassOptions;
  window.openTeacherModal = openTeacherModal;
  window.closeTeacherModal = closeTeacherModal;
  window.initPickerEvents = initPickerEvents;

  window.openTimeModal = openTimeModal;
  window.closeTimeModal = closeTimeModal;
  window.openTimeManagementModal = openTimeModal;
  window.closeTimeManagementModal = closeTimeModal;
  window.loadTimeRestrictions = loadTimeRestrictions;
  window.initTimeManagementEvents = initTimeManagementEvents;

  window.initTeacherPortalInspector = initTeacherPortalInspector;
  window.switchTeacherTab = switchTeacherTab;
  window.setCrDateShortcut = setCrDateShortcut;
  window.initClassRangeAnalytics = initClassRangeAnalytics;
  window.initTeacherInlineWorkspace = initTeacherInlineWorkspace;

  // 教師登入狀態自動啟動
  
  const TEACHER_MODALS_HTML = "  <div id=\"teacherTaskModal\" style=\"display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.75); z-index:9999; align-items:center; justify-content:center; backdrop-filter:blur(4px);\">\n    <div style=\"background:#ffffff; border-radius:16px; padding:22px 24px; max-width:680px; width:94%; box-shadow:0 25px 60px rgba(0,0,0,0.5); max-height:92vh; overflow-y:auto; border:1.5px solid #D2D6E8; color:#232A4D; font-family:system-ui, sans-serif;\">\n      <div style=\"display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;\">\n        <h3 style=\"margin:0; font-size:18px; display:flex; align-items:center; gap:8px; color:#fff;\">\n          📝 每日指定單字測驗\n        </h3>\n        <button id=\"btnCloseTeacherModal\" style=\"background:none; border:none; font-size:24px; cursor:pointer; color:#94a3b8;\">&times;</button>\n      </div>\n\n      <p style=\"font-size:13px; color:#94a3b8; margin:0 0 14px 0; line-height:1.5;\">\n        可指定測驗日期與目標班級，從 2000 單字庫勾選或隨機抽單字。學生於指定日期登入時將優先進行純聽拼測驗！\n      </p>\n\n      <div style=\"display:grid; grid-template-columns: 1.15fr 1fr 1.6fr; gap:12px; margin-bottom:12px;\">\n        <div>\n          <label style=\"font-size:13px; font-weight:600; display:block; margin-bottom:4px; color:#5A6183;\">📅 指定測驗日期：</label>\n          <input type=\"date\" id=\"t-modal-date\"\n            style=\"width:100%; padding:8px 10px; border-radius:8px; border:1px solid #D2D6E8; background:#F6F7FB; color:#fff; font-size:13.5px; box-sizing:border-box;\">\n        </div>\n        <div>\n          <label style=\"font-size:13px; font-weight:600; display:block; margin-bottom:4px; color:#5A6183;\">🏫 目標班級：</label>\n          <div style=\"display:flex; gap:6px; align-items:center;\">\n            <select id=\"t-modal-class-select\"\n              style=\"width:100%; padding:8px 10px; border-radius:8px; border:1px solid #D2D6E8; background:#F6F7FB; color:#fff; font-size:13.5px; box-sizing:border-box; cursor:pointer;\">\n              <option value=\"all\">🌐 全校 / 所有班級 (all)</option>\n              <optgroup label=\"七年級 (國一)\">\n                <option value=\"701\">🏫 701 班</option>\n                <option value=\"702\">🏫 702 班</option>\n                <option value=\"703\">🏫 703 班</option>\n                <option value=\"704\">🏫 704 班</option>\n                <option value=\"705\">🏫 705 班</option>\n              </optgroup>\n              <optgroup label=\"八年級 (國二)\">\n                <option value=\"801\">🏫 801 班</option>\n                <option value=\"802\">🏫 802 班</option>\n                <option value=\"803\">🏫 803 班</option>\n                <option value=\"804\">🏫 804 班</option>\n                <option value=\"805\">🏫 805 班</option>\n              </optgroup>\n              <optgroup label=\"九年級 (國三)\">\n                <option value=\"901\">🏫 901 班</option>\n                <option value=\"902\">🏫 902 班</option>\n                <option value=\"903\">🏫 903 班</option>\n                <option value=\"904\">🏫 904 班</option>\n                <option value=\"905\">🏫 905 班</option>\n              </optgroup>\n              <option value=\"custom\">✏️ 自訂輸入其他班級...</option>\n            </select>\n            <input type=\"text\" id=\"t-modal-class-custom\" placeholder=\"請輸入班級\"\n              style=\"display:none; width:110px; padding:8px 10px; border-radius:8px; border:1px solid #6366f1; background:#F6F7FB; color:#fff; font-size:13.5px; box-sizing:border-box;\">\n          </div>\n        </div>\n        <div>\n          <label style=\"font-size:13px; font-weight:600; display:block; margin-bottom:4px; color:#5A6183;\">📝 任務名稱：</label>\n          <input type=\"text\" id=\"t-modal-name\" placeholder=\"例：11-04指定單字測驗\" value=\"\"\n            style=\"width:100%; padding:8px 10px; border-radius:8px; border:1px solid #D2D6E8; background:#F6F7FB; color:#fff; font-size:14px; box-sizing:border-box;\">\n        </div>\n      </div>\n\n      <div style=\"border:1px solid #E7E9F5; border-radius:12px; padding:12px 14px; background:#F6F7FB; margin-bottom:12px;\">\n        <div style=\"display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;\">\n          <span style=\"font-size:13.5px; font-weight:700; color:#232A4D; display:flex; align-items:center; gap:6px;\">\n            📚 從 2000 單字庫勾選單字\n          </span>\n          <span id=\"t-modal-count-badge\" style=\"font-size:13px; color:#818cf8; font-weight:700; background:rgba(99,102,241,0.2); padding:3px 10px; border-radius:6px; border:1px solid rgba(99,102,241,0.3);\">\n            已選取 0 個單字\n          </span>\n        </div>\n\n        <div style=\"display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;\" id=\"t-filter-chips\">\n          <button type=\"button\" class=\"btn-picker-chip active\" data-lv=\"all\" style=\"padding:4px 10px; font-size:12px; border-radius:6px; border:1px solid #6366f1; background:#6366f1; color:#fff; cursor:pointer;\">全部 (2055)</button>\n          <button type=\"button\" class=\"btn-picker-chip\" data-lv=\"1\" style=\"padding:4px 10px; font-size:12px; border-radius:6px; border:1px solid #D2D6E8; background:#ffffff; color:#5A6183; cursor:pointer;\">Lv1 入門</button>\n          <button type=\"button\" class=\"btn-picker-chip\" data-lv=\"2\" style=\"padding:4px 10px; font-size:12px; border-radius:6px; border:1px solid #D2D6E8; background:#ffffff; color:#5A6183; cursor:pointer;\">Lv2 基礎</button>\n          <button type=\"button\" class=\"btn-picker-chip\" data-lv=\"3\" style=\"padding:4px 10px; font-size:12px; border-radius:6px; border:1px solid #D2D6E8; background:#ffffff; color:#5A6183; cursor:pointer;\">Lv3 進階</button>\n          <button type=\"button\" class=\"btn-picker-chip\" data-lv=\"4\" style=\"padding:4px 10px; font-size:12px; border-radius:6px; border:1px solid #D2D6E8; background:#ffffff; color:#5A6183; cursor:pointer;\">Lv4 挑戰</button>\n          <button type=\"button\" class=\"btn-picker-chip\" data-lv=\"5\" style=\"padding:4px 10px; font-size:12px; border-radius:6px; border:1px solid #D2D6E8; background:#ffffff; color:#5A6183; cursor:pointer;\">Lv5 精熟</button>\n        </div>\n\n        <div style=\"display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:10px;\">\n          <input type=\"text\" id=\"t-modal-search\" placeholder=\"🔍 搜尋單字或中文...\"\n            style=\"flex:1; min-width:140px; padding:6px 10px; border-radius:6px; border:1px solid #D2D6E8; font-size:13px; background:#ffffff; color:#fff; box-sizing:border-box;\">\n          <button type=\"button\" id=\"t-btn-random10\" style=\"padding:6px 12px; font-size:12.5px; border-radius:6px; border:1px solid #D2D6E8; background:#E7E9F5; color:#fff; cursor:pointer;\">🎲 隨機10字</button>\n          <button type=\"button\" id=\"t-btn-random20\" style=\"padding:6px 12px; font-size:12.5px; border-radius:6px; border:1px solid #D2D6E8; background:#E7E9F5; color:#fff; cursor:pointer;\">🎲 隨機20字</button>\n          <button type=\"button\" id=\"t-btn-selectall\" style=\"padding:6px 12px; font-size:12.5px; border-radius:6px; border:1px solid #D2D6E8; background:#E7E9F5; color:#fff; cursor:pointer;\">➕ 全選本組</button>\n          <button type=\"button\" id=\"t-btn-clear\" style=\"padding:6px 12px; font-size:12.5px; border-radius:6px; border:1px solid #dc2626; background:#991b1b; color:#fff; cursor:pointer;\">🧹 清空</button>\n        </div>\n\n        <div id=\"t-word-grid\" style=\"max-height:180px; overflow-y:auto; display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:6px; padding:6px; background:#ffffff; border:1px solid #E7E9F5; border-radius:8px;\">\n          <div style=\"grid-column:1/-1; text-align:center; padding:15px; color:#94a3b8; font-size:13px;\">載入單字庫中...</div>\n        </div>\n\n        <div style=\"margin-top:8px;\">\n          <details open style=\"font-size:12.5px; color:#94a3b8;\">\n            <summary style=\"cursor:pointer; font-weight:600; color:#818cf8; user-select:none; margin-bottom:4px;\">\n              👁️ 已選單字預覽 (<span id=\"t-preview-count\">0</span> 字，點擊 ✕ 可移除)\n            </summary>\n            <div id=\"t-preview-tags\" style=\"display:flex; flex-wrap:wrap; gap:4px; max-height:85px; overflow-y:auto; padding:6px; background:#ffffff; border:1px solid #E7E9F5; border-radius:6px;\">\n              <span style=\"color:#64748b; font-size:12px;\">尚未選取任何單字</span>\n            </div>\n          </details>\n        </div>\n      </div>\n\n      <div style=\"display:flex; gap:12px; align-items:center; margin-bottom:12px;\">\n        <div style=\"flex:1;\">\n          <label style=\"font-size:13px; font-weight:600; display:block; margin-bottom:4px; color:#5A6183;\">測驗模式：</label>\n          <select id=\"t-modal-mode\" style=\"width:100%; padding:8px 10px; border-radius:8px; border:1px solid #D2D6E8; background:#F6F7FB; color:#fff; font-size:13.5px;\">\n            <option value=\"抽測\">🎲 隨機抽測 N 題</option>\n            <option value=\"全考\">💯 全部都考 (考所選的所有單字)</option>\n          </select>\n        </div>\n        <div id=\"t-modal-count-wrap\" style=\"width:130px;\">\n          <label style=\"font-size:13px; font-weight:600; display:block; margin-bottom:4px; color:#5A6183;\">抽測題數：</label>\n          <input type=\"number\" id=\"t-modal-count\" value=\"5\" min=\"1\" max=\"100\"\n            style=\"width:100%; padding:8px 10px; border-radius:8px; border:1px solid #D2D6E8; background:#F6F7FB; color:#fff; font-size:13.5px; box-sizing:border-box;\">\n        </div>\n      </div>\n\n      <div style=\"display:flex; gap:10px;\">\n        <button id=\"t-btn-publish\" style=\"flex:1.2; padding:11px; font-weight:bold; font-size:14px; border-radius:8px; background:#2563eb; color:#fff; border:none; cursor:pointer;\">\n          💾 發布任務至試算表 (同步給全班)\n        </button>\n        <button id=\"t-btn-preview-run\" style=\"flex:1; padding:11px; font-weight:bold; font-size:14px; border-radius:8px; background:#7c3aed; color:#fff; border:none; cursor:pointer;\">\n          🎯 立即以此單字開始測驗 (預覽)\n        </button>\n      </div>\n\n      <div id=\"t-modal-msg\" style=\"font-size:13px; text-align:center; min-height:18px; margin-top:8px; color:#38bdf8;\"></div>\n    </div>\n  </div>\n\n  <!-- ══════════════════════════════════════════\n       教師使用時間與解除限制管理 Modal\n  ══════════════════════════════════════════ -->\n  <div id=\"timeManagementModal\" style=\"display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.75); z-index:9999; align-items:center; justify-content:center; backdrop-filter:blur(4px);\">\n    <div style=\"background:#ffffff; border-radius:16px; padding:22px 24px; max-width:680px; width:94%; box-shadow:0 25px 60px rgba(0,0,0,0.5); max-height:92vh; overflow-y:auto; border:1.5px solid #D2D6E8; color:#232A4D; font-family:system-ui, sans-serif;\">\n      \n      <!-- 標題與關閉按鈕 -->\n      <div style=\"display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;\">\n        <h3 style=\"margin:0; font-size:18px; display:flex; align-items:center; gap:8px; color:#fff;\">\n          ⏰ 學生開放時間管制與自訂設定\n        </h3>\n        <button id=\"btnCloseTimeModal\" style=\"background:none; border:none; font-size:24px; cursor:pointer; color:#94a3b8;\">&times;</button>\n      </div>\n\n      <!-- 分頁頁籤切換按鈕 -->\n      <div style=\"display:flex; gap:6px; margin-bottom:16px; border-bottom:1px solid #E7E9F5; padding-bottom:10px; flex-wrap:wrap;\">\n        <button id=\"tm-tab-btn-limit\" style=\"flex:1; min-width:140px; padding:9px 10px; border-radius:8px; border:1px solid #3b82f6; background:#3b82f6; color:#fff; font-size:12.5px; font-weight:700; cursor:pointer; transition:all 0.2s;\">\n          ⏱️ 每日10分鐘限制與延長\n        </button>\n        <button id=\"tm-tab-btn-global\" style=\"flex:1; min-width:130px; padding:9px 10px; border-radius:8px; border:1px solid #D2D6E8; background:#ffffff; color:#5A6183; font-size:12.5px; font-weight:700; cursor:pointer; transition:all 0.2s;\">\n          ⚙️ 全校預設時段\n        </button>\n        <button id=\"tm-tab-btn-student\" style=\"flex:1; min-width:130px; padding:9px 10px; border-radius:8px; border:1px solid #D2D6E8; background:#ffffff; color:#5A6183; font-size:12.5px; font-weight:700; cursor:pointer; transition:all 0.2s;\">\n          👤 個別學生時段\n        </button>\n        <button id=\"tm-tab-btn-date\" style=\"flex:1; min-width:130px; padding:9px 10px; border-radius:8px; border:1px solid #D2D6E8; background:#ffffff; color:#5A6183; font-size:12.5px; font-weight:700; cursor:pointer; transition:all 0.2s;\">\n          📅 特別日期全天解除\n        </button>\n      </div>\n\n      <!-- 分頁 1: 全校預設作答時間 -->\n      <div id=\"tm-tab-panel-global\" style=\"display:none;\">\n        <div style=\"background:#F6F7FB; border-radius:10px; padding:12px 16px; border:1px solid #E7E9F5; margin-bottom:14px;\">\n          <div style=\"font-size:13.5px; font-weight:700; color:#38bdf8; margin-bottom:4px;\">📌 全校預設作答時間說明</div>\n          <div style=\"font-size:13px; color:#94a3b8; line-height:1.6;\">\n            • <b>預設時段</b>：每次設定將自動保存，日後一律以<b>上次教師修改之設定</b>為基準（預設為 07:30 ～ 22:00）。<br>\n            • <b>適用對象</b>：全校所有學生作答與登入皆受此時段管制。<br>\n            • <b>個別彈性</b>：若有特定學生需要不同時段，可切換至「個別學生自訂時間」單獨微調。\n          </div>\n        </div>\n\n        <div style=\"border:1px solid #E7E9F5; border-radius:12px; padding:16px; background:#F6F7FB; margin-bottom:14px;\">\n          <div style=\"font-size:14px; font-weight:700; color:#232A4D; margin-bottom:12px;\">\n            🕒 設定全校每日作答時間範圍\n          </div>\n          <div style=\"display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;\">\n            <div>\n              <label style=\"font-size:12.5px; color:#5A6183; display:block; margin-bottom:4px;\">每日開始作答時間：</label>\n              <input type=\"time\" id=\"tm-global-start\" value=\"07:30\" style=\"width:100%; padding:8px 10px; border-radius:6px; border:1px solid #D2D6E8; background:#ffffff; color:#fff; font-size:14px; box-sizing:border-box;\">\n            </div>\n            <div>\n              <label style=\"font-size:12.5px; color:#5A6183; display:block; margin-bottom:4px;\">每日結束作答時間：</label>\n              <input type=\"time\" id=\"tm-global-end\" value=\"22:00\" style=\"width:100%; padding:8px 10px; border-radius:6px; border:1px solid #D2D6E8; background:#ffffff; color:#fff; font-size:14px; box-sizing:border-box;\">\n            </div>\n          </div>\n          <div style=\"display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;\">\n            <div id=\"tm-global-last-updated\" style=\"font-size:12px; color:#64748b;\">\n              目前套用上次儲存設定\n            </div>\n            <button id=\"tm-btn-save-global\" style=\"padding:9px 20px; border-radius:8px; background:#4f46e5; color:#fff; border:none; font-weight:700; font-size:13.5px; cursor:pointer;\">\n              💾 儲存並套用全校預設作答時間\n            </button>\n          </div>\n        </div>\n      </div>\n\n      <!-- 分頁 2: 個別學生自訂時間 -->\n      <div id=\"tm-tab-panel-student\" style=\"display:none;\">\n        <div style=\"background:#F6F7FB; border-radius:10px; padding:12px 16px; border:1px solid #E7E9F5; margin-bottom:14px;\">\n          <div style=\"font-size:13.5px; font-weight:700; color:#38bdf8; margin-bottom:4px;\">👤 個別學生自訂時段說明</div>\n          <div style=\"font-size:13px; color:#94a3b8; line-height:1.6;\">\n            • 若學生有特例需求（如放學輔導、特定作答許可），可在此為其指定專屬開始與結束時間。<br>\n            • <b>優先權判定</b>：具專屬設定之學生將優先採用該時段，不受全校預設時段限制。\n          </div>\n        </div>\n\n        <div style=\"border:1px solid #E7E9F5; border-radius:12px; padding:16px; background:#F6F7FB; margin-bottom:14px;\">\n          <div style=\"font-size:14px; font-weight:700; color:#232A4D; margin-bottom:10px;\">\n            ➕ 新增或修改學生專屬作答時間\n          </div>\n          <div style=\"display:grid; grid-template-columns:1fr 2fr; gap:10px; margin-bottom:10px;\">\n            <div>\n              <label style=\"font-size:12.5px; color:#5A6183; display:block; margin-bottom:4px;\">篩選班級：</label>\n              <select id=\"tm-student-class-filter\" style=\"width:100%; padding:8px 10px; border-radius:6px; border:1px solid #D2D6E8; background:#ffffff; color:#fff; font-size:13px; box-sizing:border-box;\">\n                <option value=\"all\">所有班級</option>\n              </select>\n            </div>\n            <div>\n              <label style=\"font-size:12.5px; color:#5A6183; display:block; margin-bottom:4px;\">選擇學生：</label>\n              <select id=\"tm-student-select\" style=\"width:100%; padding:8px 10px; border-radius:6px; border:1px solid #D2D6E8; background:#ffffff; color:#fff; font-size:13px; box-sizing:border-box;\">\n                <option value=\"\">-- 請選擇學生 --</option>\n              </select>\n            </div>\n          </div>\n          <div style=\"display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;\">\n            <div>\n              <label style=\"font-size:12.5px; color:#5A6183; display:block; margin-bottom:4px;\">該學生可作答開始時間：</label>\n              <input type=\"time\" id=\"tm-student-start\" value=\"07:30\" style=\"width:100%; padding:8px 10px; border-radius:6px; border:1px solid #D2D6E8; background:#ffffff; color:#fff; font-size:13.5px; box-sizing:border-box;\">\n            </div>\n            <div>\n              <label style=\"font-size:12.5px; color:#5A6183; display:block; margin-bottom:4px;\">該學生可作答結束時間：</label>\n              <input type=\"time\" id=\"tm-student-end\" value=\"22:00\" style=\"width:100%; padding:8px 10px; border-radius:6px; border:1px solid #D2D6E8; background:#ffffff; color:#fff; font-size:13.5px; box-sizing:border-box;\">\n            </div>\n          </div>\n          <div style=\"display:flex; gap:10px; align-items:center;\">\n            <input type=\"text\" id=\"tm-student-remark\" placeholder=\"備註說明（例：留校輔導、自學延長）\" style=\"flex:1; padding:8px 10px; border-radius:6px; border:1px solid #D2D6E8; background:#ffffff; color:#fff; font-size:13px; box-sizing:border-box;\">\n            <button id=\"tm-btn-save-student\" style=\"padding:8px 18px; border-radius:6px; background:#059669; color:#fff; border:none; font-weight:700; font-size:13px; cursor:pointer; white-space:nowrap;\">\n              💾 儲存該學生專屬作答時間\n            </button>\n          </div>\n        </div>\n\n        <div>\n          <div style=\"display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;\">\n            <span style=\"font-size:13.5px; font-weight:700; color:#232A4D;\">📋 已設定專屬時段學生清單</span>\n            <span id=\"tm-student-rules-count\" style=\"font-size:12px; color:#94a3b8;\">共 0 位學生</span>\n          </div>\n          <div id=\"tm-student-rules-list\" style=\"background:#F6F7FB; border:1px solid #E7E9F5; border-radius:8px; max-height:180px; overflow-y:auto; padding:8px;\">\n            <div style=\"text-align:center; padding:15px; color:#64748b; font-size:13px;\">載入中...</div>\n          </div>\n        </div>\n      </div>\n\n      <!-- 分頁 3: 特別日期全天解除 -->\n      <div id=\"tm-tab-panel-date\" style=\"display:none;\">\n        <div style=\"background:#F6F7FB; border-radius:10px; padding:12px 16px; border:1px solid #E7E9F5; margin-bottom:14px;\">\n          <div style=\"font-size:13.5px; font-weight:700; color:#38bdf8; margin-bottom:4px;\">📅 特別日期全天開放說明</div>\n          <div style=\"font-size:13px; color:#94a3b8; line-height:1.6;\">\n            • 當設定特別解除日期時，該指定日<b>全天 24 小時暢行開放</b>。<br>\n            • 可用於週末集訓、段考衝刺週、或是臨時全天開放練習。\n          </div>\n        </div>\n\n        <!-- 今日即時狀態與一鍵快捷操作 -->\n        <div style=\"background:#ffffff; border:1px solid #3b82f6; border-radius:10px; padding:12px 16px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;\">\n          <div>\n            <div style=\"font-size:12.5px; color:#94a3b8;\">📅 今日系統狀態：</div>\n            <div id=\"tm-today-status-badge\" style=\"font-size:14px; font-weight:700; color:#10b981; margin-top:2px;\">\n              載入狀態中...\n            </div>\n          </div>\n          <div>\n            <button id=\"tm-btn-quick-toggle\" style=\"padding:9px 16px; border-radius:8px; background:#10b981; color:#fff; border:none; font-size:13px; font-weight:700; cursor:pointer; transition:all 0.2s;\">\n              ⚡ 一鍵解除今日限制 (今日全天開放)\n            </button>\n          </div>\n        </div>\n\n        <!-- 新增解除限制設定區 -->\n        <div style=\"border:1px solid #E7E9F5; border-radius:12px; padding:14px 16px; background:#F6F7FB; margin-bottom:14px;\">\n          <div style=\"font-size:13.5px; font-weight:700; color:#232A4D; margin-bottom:10px; display:flex; align-items:center; gap:6px;\">\n            ➕ 新增解除限制 (指定單日或日期範圍)\n          </div>\n          <div style=\"display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;\">\n            <div>\n              <label style=\"font-size:12.5px; color:#5A6183; display:block; margin-bottom:4px;\">起始日期：</label>\n              <input type=\"date\" id=\"tm-input-start\" style=\"width:100%; padding:7px 10px; border-radius:6px; border:1px solid #D2D6E8; background:#ffffff; color:#fff; font-size:13px; box-sizing:border-box;\">\n            </div>\n            <div>\n              <label style=\"font-size:12.5px; color:#5A6183; display:block; margin-bottom:4px;\">結束日期 (單日請填相同日期)：</label>\n              <input type=\"date\" id=\"tm-input-end\" style=\"width:100%; padding:7px 10px; border-radius:6px; border:1px solid #D2D6E8; background:#ffffff; color:#fff; font-size:13px; box-sizing:border-box;\">\n            </div>\n          </div>\n          <div style=\"display:flex; gap:10px; align-items:center;\">\n            <input type=\"text\" id=\"tm-input-name\" placeholder=\"設定名稱或備註（例：段考衝刺溫書週、週末集訓開放）\" style=\"flex:1; padding:8px 10px; border-radius:6px; border:1px solid #D2D6E8; background:#ffffff; color:#fff; font-size:13px; box-sizing:border-box;\">\n            <button id=\"tm-btn-save-override\" style=\"padding:8px 18px; border-radius:6px; background:#2563eb; color:#fff; border:none; font-weight:700; font-size:13px; cursor:pointer; white-space:nowrap;\">\n              💾 儲存並生效\n            </button>\n          </div>\n        </div>\n\n        <!-- 已生效解除規則清單 -->\n        <div>\n          <div style=\"display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;\">\n            <span style=\"font-size:13.5px; font-weight:700; color:#232A4D;\">📋 目前生效的解除限制清單</span>\n            <button id=\"tm-btn-refresh\" style=\"background:none; border:1px solid #D2D6E8; padding:3px 8px; border-radius:6px; color:#94a3b8; font-size:12px; cursor:pointer;\">🔄 重新整理</button>\n          </div>\n          <div id=\"tm-rules-list\" style=\"background:#F6F7FB; border:1px solid #E7E9F5; border-radius:8px; max-height:180px; overflow-y:auto; padding:8px;\">\n            <div style=\"text-align:center; padding:15px; color:#64748b; font-size:13px;\">載入中...</div>\n          </div>\n        </div>\n      </div>\n\n      <!-- 分頁 4: 每日 10 分鐘限制與延長 -->\n      <div id=\"tm-tab-panel-limit\" style=\"display:block;\">\n        <div style=\"background:#F6F7FB; border-radius:10px; padding:12px 16px; border:1px solid #E7E9F5; margin-bottom:14px;\">\n          <div style=\"font-size:13.5px; font-weight:700; color:#38bdf8; margin-bottom:4px;\">⏱️ 每日使用時長與延長限制說明</div>\n          <div style=\"font-size:13px; color:#94a3b8; line-height:1.6;\">\n            • <b>計時規則</b>：學生當天第一次登入後開始起算時間（預設每日 10 分鐘）。<br>\n            • <b>到期保護</b>：時間到了之後，系統自動鎖定作答卡片，<b>僅顯示學習進度 Progress 方塊</b>與作答紀錄供學生複習。<br>\n            • <b>教師彈性控制</b>：教師可隨時於下方為全校或個別學生<b>設定每日時間、即時延長時間、或一鍵完全解除限制</b>。\n          </div>\n        </div>\n\n        <!-- 區塊 A: 全校每日預設時長設定 -->\n        <div style=\"border:1px solid #E7E9F5; border-radius:12px; padding:14px 16px; background:#F6F7FB; margin-bottom:14px;\">\n          <div style=\"font-size:13.5px; font-weight:700; color:#232A4D; margin-bottom:10px;\">\n            ⚙️ 設定全校每日預設練習時間上限\n          </div>\n          <div style=\"display:flex; gap:10px; align-items:center; flex-wrap:wrap;\">\n            <select id=\"tm-limit-default-minutes\" style=\"padding:8px 12px; border-radius:6px; border:1px solid #D2D6E8; background:#ffffff; color:#fff; font-size:13.5px;\">\n              <option value=\"5\">5 分鐘</option>\n              <option value=\"10\" selected>10 分鐘 (預設)</option>\n              <option value=\"15\">15 分鐘</option>\n              <option value=\"20\">20 分鐘</option>\n              <option value=\"30\">30 分鐘</option>\n              <option value=\"45\">45 分鐘</option>\n              <option value=\"60\">60 分鐘</option>\n            </select>\n            <button id=\"tm-btn-save-limit-minutes\" style=\"padding:8px 16px; border-radius:6px; background:#4f46e5; color:#fff; border:none; font-weight:700; font-size:13px; cursor:pointer;\">\n              💾 儲存全校預設時長\n            </button>\n            <span id=\"tm-limit-current-display\" style=\"font-size:12.5px; color:#38bdf8; margin-left:auto;\">\n              目前全校預設：10 分鐘\n            </span>\n          </div>\n        </div>\n\n        <!-- 區塊 B: 個別學生延長時間或解除限制 -->\n        <div style=\"border:1px solid #E7E9F5; border-radius:12px; padding:14px 16px; background:#F6F7FB; margin-bottom:14px;\">\n          <div style=\"font-size:13.5px; font-weight:700; color:#232A4D; margin-bottom:10px;\">\n            👤 個別學生即時延長時間或解除限制\n          </div>\n          <div style=\"display:grid; grid-template-columns:1fr 2fr; gap:10px; margin-bottom:10px;\">\n            <div>\n              <label style=\"font-size:12px; color:#5A6183; display:block; margin-bottom:4px;\">篩選班級：</label>\n              <select id=\"tm-limit-class-filter\" style=\"width:100%; padding:8px 10px; border-radius:6px; border:1px solid #D2D6E8; background:#ffffff; color:#fff; font-size:13px; box-sizing:border-box;\">\n                <option value=\"all\">所有班級</option>\n              </select>\n            </div>\n            <div>\n              <label style=\"font-size:12px; color:#5A6183; display:block; margin-bottom:4px;\">選擇學生：</label>\n              <select id=\"tm-limit-student-select\" style=\"width:100%; padding:8px 10px; border-radius:6px; border:1px solid #D2D6E8; background:#ffffff; color:#fff; font-size:13px; box-sizing:border-box;\">\n                <option value=\"\">-- 請選擇學生 --</option>\n              </select>\n            </div>\n          </div>\n\n          <!-- 學生當日狀態資訊卡 -->\n          <div id=\"tm-limit-student-status-box\" style=\"padding:10px 14px; background:#F6F7FB; border-radius:8px; border:1px solid #E7E9F5; margin-bottom:12px; font-size:13px; color:#5A6183;\">\n            請選擇學生以查看其今日練習時間與即時狀態\n          </div>\n\n          <!-- 快捷操作按鈕群 -->\n          <div style=\"display:flex; gap:8px; flex-wrap:wrap;\">\n            <button id=\"tm-btn-extend-5\" style=\"padding:8px 14px; border-radius:6px; background:#059669; color:#fff; border:none; font-weight:700; font-size:12.5px; cursor:pointer;\">\n              ⚡ 延長 5 分鐘\n            </button>\n            <button id=\"tm-btn-extend-10\" style=\"padding:8px 14px; border-radius:6px; background:#059669; color:#fff; border:none; font-weight:700; font-size:12.5px; cursor:pointer;\">\n              ⚡ 延長 10 分鐘\n            </button>\n            <button id=\"tm-btn-extend-15\" style=\"padding:8px 14px; border-radius:6px; background:#059669; color:#fff; border:none; font-weight:700; font-size:12.5px; cursor:pointer;\">\n              ⚡ 延長 15 分鐘\n            </button>\n            <button id=\"tm-btn-unlock-student\" style=\"padding:8px 14px; border-radius:6px; background:#2563eb; color:#fff; border:none; font-weight:700; font-size:12.5px; cursor:pointer;\">\n              🔓 今日完全解除限制 (不限時)\n            </button>\n            <button id=\"tm-btn-lock-student\" style=\"padding:8px 14px; border-radius:6px; background:#dc2626; color:#fff; border:none; font-weight:700; font-size:12.5px; cursor:pointer;\">\n              🔒 恢復時間限制\n            </button>\n          </div>\n        </div>\n\n        <!-- 區塊 C: 全校快速操作 -->\n        <div style=\"border:1px solid #E7E9F5; border-radius:12px; padding:12px 16px; background:#F6F7FB; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;\">\n          <div>\n            <div style=\"font-size:13px; font-weight:700; color:#232A4D;\">⚡ 全校快速時長控制</div>\n            <div style=\"font-size:12px; color:#94a3b8;\">可一鍵為全體學生今日延長時間或解除限制</div>\n          </div>\n          <div style=\"display:flex; gap:8px;\">\n            <button id=\"tm-btn-extend-all-10\" style=\"padding:8px 14px; border-radius:6px; background:#059669; color:#fff; border:none; font-weight:700; font-size:12.5px; cursor:pointer;\">\n              ⚡ 全校今日延長 10 分鐘\n            </button>\n            <button id=\"tm-btn-unlock-all\" style=\"padding:8px 14px; border-radius:6px; background:#2563eb; color:#fff; border:none; font-weight:700; font-size:12.5px; cursor:pointer;\">\n              🔓 全校今日解除限制\n            </button>\n          </div>\n        </div>\n      </div>\n\n      <div id=\"tm-modal-msg\" style=\"font-size:13px; text-align:center; min-height:18px; margin-top:10px; color:#38bdf8;\"></div>\n    </div>\n  </div>";
  function ensureTeacherModalsMounted() {
    if (document.getElementById("teacherTaskModal")) return;
    const container = document.createElement("div");
    container.id = "teacher-dynamic-modals";
    container.innerHTML = TEACHER_MODALS_HTML;
    document.body.appendChild(container);
  }
  window.ensureTeacherModalsMounted = ensureTeacherModalsMounted;

  function autoInitTeacherPortal() {
    try { ensureTeacherModalsMounted(); } catch(_) {}

    const curRole = localStorage.getItem("user_role") || sessionStorage.getItem("user_role");
    if (curRole === "teacher" || curRole === "admin") {
      try { initPickerEvents(); } catch(_) {}
      try { initTimeManagementEvents(); } catch(_) {}
      try { initTeacherInlineWorkspace(); } catch(_) {}
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInitTeacherPortal);
  } else {
    autoInitTeacherPortal();
  }

})(window, document);