import streamlit as st
import streamlit.components.v1 as components
import json
import os
import tempfile
import base64
import hashlib
import time
import requests
import logging
import re
from pathlib import Path
from openai import OpenAI
from typing import Optional, Dict, Any, Tuple, List
from datetime import datetime

# .env 파일 로드
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv가 설치되지 않은 경우 무시

# ============================================
# 로깅 설정
# ============================================
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================
# 상수 정의 (Constants)
# ============================================

# 분석 시스템 프롬프트
ANALYSIS_SYSTEM_PROMPT = """당신은 대한민국 최고의 게임업계 취업 컨설턴트입니다. 제공된 면접 대화 로그를 정밀 분석하여 피드백 리포트를 작성하세요.

## [🚨 매우 중요한 분석 규칙 (Fact Check)]

1. **기억 왜곡 방지:** 지원자가 하지 않은 말을 지어내거나, 지원자가 한 말을 반대로 해석하지 마십시오.

2. **복사 붙여넣기 금지:** '개선안'에 지원자가 이미 답변한 내용을 똑같이 쓰지 마십시오. (가장 중요)
   - 지원자의 답변이 이미 훌륭하다면 "현재 답변이 매우 논리적이므로 유지하세요"라고 칭찬하거나, 더 발전시킬 수 있는 '심화 표현'만 제안하세요.

3. **3단계 분석 구조 준수:** 문항별 분석 시 반드시 **[요약 -> 평가 -> 개선]** 순서를 지키세요.

## [작성 포맷 (JSON 내 Markdown)]

아래 JSON 구조의 `detailed_feedback_markdown` 필드에 들어갈 텍스트는 반드시 아래 형식을 따라야 합니다.

# 1. 종합 평가

(전체적인 강점, 약점, 합격 가능성을 서술형으로 작성)

# 2. 문항별 정밀 분석

## Q1. [질문 내용 요약]

- **🗣️ 지원자 답변 요약:** (지원자가 실제로 한 말을 1~2문장으로 요약. 팩트 체크용)

- **⚖️ 평가:** (잘한 점과 아쉬운 점 분석)

- **💡 개선 가이드:** (지원자가 **말하지 않은** 더 좋은 표현이나 논리 보강 제안. 이미 잘했으면 칭찬)

(모든 문항 반복...)

# 3. 역량별 심층 평가

(5대 역량에 대한 구체적 평가)

평가 기준:
1. job_fit (직무 적합도): 지원 직군에 필요한 역량과 경험의 적합성 (0-100)
2. logic (논리성): 답변의 논리적 구조와 일관성 (0-100)
3. game_sense (게임 센스): 게임 업계에 대한 이해도와 인사이트 (0-100)
4. attitude (태도): 면접 태도와 열정 (0-100)
5. communication (소통 능력): 의사 전달의 명확성과 구조화 (0-100)

반드시 유효한 JSON만 반환하세요. 다른 설명이나 텍스트는 포함하지 마세요."""

# CSS 스타일 (사이드바 고정)
SIDEBAR_CSS = """
<style>
    /* 1. 헤더 숨기기 */
    header[data-testid="stHeader"] {
        display: none;
    }

    /* 2. [정밀 타격] 사이드바 여닫는 컨트롤 버튼만 정확히 숨기기 */
    [data-testid="stSidebarCollapsedControl"],
    [data-testid="stSidebarExpandedControl"] {
        display: none !important;
        visibility: hidden !important;
    }
</style>
"""

# Daglo API 설정
DAGLO_API_BASE_URL = "https://apis.daglo.ai/stt/v1/async/transcripts"
DAGLO_MAX_WAIT_TIME = 30  # 최대 대기 시간 (초)
DAGLO_INITIAL_POLL_INTERVAL = 1.0  # 초기 폴링 간격 (초)
DAGLO_MAX_POLL_INTERVAL = 3.0  # 최대 폴링 간격 (초)
DAGLO_BACKOFF_MULTIPLIER = 1.5  # 백오프 배수

# 점수 레이블 매핑
SCORE_LABELS = {
    "job_fit": "직무 적합도",
    "logic": "논리성",
    "game_sense": "게임 센스",
    "attitude": "태도",
    "communication": "소통 능력"
}

# 페이지 설정
st.set_page_config(
    page_title="AI 실전 모의면접관",
    page_icon="🎮",
    layout="wide",
    initial_sidebar_state="expanded"
)

# ============================================
# [UI 강제 설정] 사이드바 고정 및 헤더 숨기기
# ============================================
# Streamlit은 사이드바 접기/펴기 버튼을 기본 제공하므로 CSS/JS로 강제 제거
st.markdown("""
<style>
    /* 1. 헤더 숨기기 */
    header[data-testid="stHeader"] {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
    }
    
    /* 2. 사이드바 여닫는 버튼 완전 제거 - 모든 가능한 선택자 (최강 버전) */
    /* [핵심] 실제 발견된 data-testid */
    [data-testid="stSidebarCollapseButton"],
    div[data-testid="stSidebarCollapseButton"],
    button[data-testid="stBaseButton-headerNoPadding"],
    
    /* data-testid 기반 (기존) */
    [data-testid="stSidebarCollapsedControl"],
    [data-testid="stSidebarExpandedControl"],
    section[data-testid="stSidebarCollapsedControl"],
    section[data-testid="stSidebarExpandedControl"],
    div[data-testid="stSidebarCollapsedControl"],
    div[data-testid="stSidebarExpandedControl"],
    
    /* aria-label 기반 */
    button[aria-label*="Close"],
    button[aria-label*="Open"],
    button[aria-label*="sidebar"],
    button[aria-label*="Sidebar"],
    button[aria-label*="close"],
    button[aria-label*="open"],
    
    /* 클래스명 패턴 매칭 (모든 Streamlit 버전 대응) */
    [class*="sidebar"][class*="control"],
    [class*="sidebar"][class*="toggle"],
    [class*="sidebar"][class*="button"],
    button[class*="sidebar"][class*="control"],
    button[class*="sidebar"][class*="toggle"],
    section[class*="sidebar"][class*="control"],
    div[class*="sidebar"][class*="control"],
    
    /* 특정 텍스트를 포함하는 버튼 (<< 또는 >>) */
    button:has(> *:contains("<<")),
    button:has(> *:contains(">>")),
    button:has(> *:contains("◀")),
    button:has(> *:contains("▶")),
    
    /* Streamlit의 모든 버전에서 사용 가능한 일반 선택자 */
    [role="button"][aria-label*="sidebar"],
    [role="button"][aria-label*="Sidebar"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        width: 0 !important;
        height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        pointer-events: none !important;
        position: absolute !important;
        left: -9999px !important;
        z-index: -9999 !important;
    }
    
    /* 3. 사이드바 자체를 항상 표시 및 고정 */
    section[data-testid="stSidebar"] {
        display: block !important;
        min-width: 21rem !important;
    }
    
    /* 4. 사이드바 컨테이너 내부의 모든 버튼 숨기기 (방어적 접근) */
    section[data-testid="stSidebar"] > *:first-child button,
    section[data-testid="stSidebar"] button[type="button"] {
        /* 단, 실제 기능 버튼은 제외하기 위해 더 구체적으로 */
    }
</style>
""", unsafe_allow_html=True)

# 5. JavaScript로 DOM에서 완전 제거 및 지속적 감시 (최강 버전)
# st.components.v1.html을 사용하여 더 확실하게 주입
components.html("""
<script>
    (function() {
        'use strict';
        
        console.log('✅ Sidebar removal script loaded (via components.html)');
        
        // 콘솔에서 작동한 것과 정확히 동일한 코드
        // iframe 내부와 부모 창 모두 체크
        function removeButton() {
            let removed = false;
            
            // 현재 document에서 찾기
            let btn = document.querySelector('[data-testid="stSidebarCollapseButton"]');
            if (btn) {
                btn.remove();
                console.log('✅ Sidebar button removed (current doc)!');
                removed = true;
            }
            
            // 부모 창의 document에서도 찾기 (iframe인 경우)
            try {
                if (window.parent && window.parent !== window && window.parent.document) {
                    btn = window.parent.document.querySelector('[data-testid="stSidebarCollapseButton"]');
                    if (btn) {
                        btn.remove();
                        console.log('✅ Sidebar button removed (parent doc)!');
                        removed = true;
                    }
                }
            } catch (e) {
                // Cross-origin 오류 무시
            }
            
            // 최상위 window에서도 찾기
            try {
                if (window.top && window.top !== window && window.top.document) {
                    btn = window.top.document.querySelector('[data-testid="stSidebarCollapseButton"]');
                    if (btn) {
                        btn.remove();
                        console.log('✅ Sidebar button removed (top doc)!');
                        removed = true;
                    }
                }
            } catch (e) {
                // Cross-origin 오류 무시
            }
            
            return removed;
        }
        
        // 즉시 실행
        removeButton();
        
        // 여러 시점에서 재시도 (Streamlit rerun 대응)
        const retries = [0, 10, 50, 100, 200, 500, 1000, 2000, 3000, 5000];
        retries.forEach(delay => {
            setTimeout(removeButton, delay);
        });
        
        // DOMContentLoaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', removeButton);
        } else {
            removeButton();
        }
        
        // 주기적 체크 (매우 짧은 간격)
        setInterval(removeButton, 100);
        
        // MutationObserver (강화 버전) - 모든 DOM 변경 감지
        function setupObserver(doc) {
            const observer = new MutationObserver(function(mutations) {
                mutations.forEach(function(mutation) {
                    if (mutation.addedNodes.length > 0) {
                        // 노드가 추가되면 즉시 체크
                        setTimeout(removeButton, 0);
                        setTimeout(removeButton, 10);
                        setTimeout(removeButton, 50);
                    }
                });
            });
            
            if (doc && doc.body) {
                observer.observe(doc.body, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['data-testid', 'class']
                });
            }
        }
        
        setupObserver(document);
        
        // 부모 창에도 Observer 설정
        try {
            if (window.parent && window.parent !== window && window.parent.document) {
                setupObserver(window.parent.document);
            }
        } catch (e) {
            // Cross-origin 오류 무시
        }
        
        // window load 이벤트
        window.addEventListener('load', removeButton);
        
        // Streamlit rerun 감지 (iframe)
        if (window.parent && window.parent !== window) {
            window.parent.addEventListener('load', removeButton);
        }
    })();
</script>
""", height=0)

# 추가: st.markdown으로도 주입 (이중 보험)
st.markdown("""
<script>
    (function() {
        'use strict';
        
        console.log('✅ Sidebar removal script loaded (via st.markdown)');
        
        function removeSidebarButtons() {
            // 모든 가능한 선택자로 버튼 찾기
            const selectors = [
                // [핵심] 실제 발견된 data-testid
                '[data-testid="stSidebarCollapseButton"]',
                'div[data-testid="stSidebarCollapseButton"]',
                'button[data-testid="stBaseButton-headerNoPadding"]',
                
                // data-testid 기반 (기존)
                '[data-testid="stSidebarCollapsedControl"]',
                '[data-testid="stSidebarExpandedControl"]',
                'section[data-testid="stSidebarCollapsedControl"]',
                'section[data-testid="stSidebarExpandedControl"]',
                'div[data-testid="stSidebarCollapsedControl"]',
                'div[data-testid="stSidebarExpandedControl"]',
                
                // [핵심] 실제 아이콘 요소 찾기
                'span[data-testid="stIconMaterial"]',
                '[data-testid="stIconMaterial"]'
            ];
            
            // keyboard_double_arrow_left 아이콘을 포함하는 요소 찾기 (수동 실행과 동일한 로직)
            function findAndRemoveIconButton() {
                let removed = false;
                
                // [방법 1] stSidebarCollapseButton 직접 찾기
                const collapseButton = document.querySelector('[data-testid="stSidebarCollapseButton"]');
                if (collapseButton) {
                    try {
                        collapseButton.remove();
                        removed = true;
                        console.log('✅ Sidebar button removed (by stSidebarCollapseButton)!');
                        return removed;
                    } catch (e) {
                        collapseButton.style.cssText = 'display: none !important; visibility: hidden !important; opacity: 0 !important; width: 0 !important; height: 0 !important; pointer-events: none !important; position: absolute !important; left: -9999px !important; z-index: -9999 !important;';
                        removed = true;
                        console.log('✅ Sidebar button hidden (by stSidebarCollapseButton)!');
                        return removed;
                    }
                } else {
                    console.log('⚠️ stSidebarCollapseButton not found yet');
                }
                
                // [방법 2] 아이콘으로 찾기 (백업)
                const icons = document.querySelectorAll('[data-testid="stIconMaterial"]');
                icons.forEach(icon => {
                    if (icon.textContent && icon.textContent.includes('keyboard_double_arrow_left')) {
                        let parent = icon.parentElement;
                        while (parent) {
                            // stSidebarCollapseButton 또는 button, section 등
                            if (parent.getAttribute('data-testid') === 'stSidebarCollapseButton' ||
                                parent.tagName === 'BUTTON' || 
                                parent.tagName === 'SECTION' || 
                                parent.getAttribute('data-testid')) {
                                try {
                                    parent.remove();
                                    removed = true;
                                    console.log('Sidebar button removed (by icon)!');
                                    break;
                                } catch (e) {
                                    parent.style.cssText = 'display: none !important; visibility: hidden !important; opacity: 0 !important; width: 0 !important; height: 0 !important; pointer-events: none !important; position: absolute !important; left: -9999px !important; z-index: -9999 !important;';
                                    removed = true;
                                }
                            }
                            parent = parent.parentElement;
                        }
                    }
                });
                
                return removed;
            }
            
            // 아이콘 버튼 찾기 함수 호출 (즉시 실행)
            findAndRemoveIconButton();
            
            // 추가: 클래스명으로도 찾기 (실제 발견된 클래스)
            const classElements = document.querySelectorAll('.st-emotion-cache-pd6qx2.ejhh0er0, span.st-emotion-cache-pd6qx2.ejhh0er0');
            classElements.forEach(el => {
                if (el.textContent && el.textContent.includes('keyboard_double_arrow_left')) {
                    let parent = el.parentElement;
                    while (parent) {
                        if (parent.tagName === 'BUTTON' || 
                            parent.tagName === 'SECTION' || 
                            parent.getAttribute('data-testid')) {
                            try {
                                parent.remove();
                                console.log('Sidebar button removed (by class)!');
                                break;
                            } catch (e) {
                                parent.style.cssText = 'display: none !important; visibility: hidden !important; opacity: 0 !important; width: 0 !important; height: 0 !important; pointer-events: none !important; position: absolute !important; left: -9999px !important; z-index: -9999 !important;';
                            }
                        }
                        parent = parent.parentElement;
                    }
                }
            });
            
            const additionalSelectors = [
                // aria-label 기반
                'button[aria-label*="Close"]',
                'button[aria-label*="Open"]',
                'button[aria-label*="sidebar"]',
                'button[aria-label*="Sidebar"]',
                'button[aria-label*="close"]',
                'button[aria-label*="open"]',
                
                // 클래스명 패턴
                '[class*="sidebar"][class*="control"]',
                '[class*="sidebar"][class*="toggle"]',
                '[class*="sidebar"][class*="button"]',
                
                // role 기반
                '[role="button"][aria-label*="sidebar"]',
                '[role="button"][aria-label*="Sidebar"]'
            ];
            
            let removedCount = 0;
            
            // 기본 선택자들 처리
            selectors.forEach(selector => {
                try {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        // 부모 요소 확인 (실제 사이드바 컨트롤인지)
                        const parent = el.closest('section[data-testid="stSidebar"]');
                        const isInSidebar = parent !== null;
                        
                        // 사이드바 내부에 있거나, 특정 속성을 가진 경우 제거
                        if (isInSidebar || el.getAttribute('data-testid') || el.getAttribute('aria-label')) {
                            // 완전히 제거
                            try {
                                if (el && el.parentNode) {
                                    el.parentNode.removeChild(el);
                                    removedCount++;
                                }
                            } catch (e) {
                                // 제거 실패 시 숨기기
                                el.style.cssText = 'display: none !important; visibility: hidden !important; opacity: 0 !important; width: 0 !important; height: 0 !important; pointer-events: none !important; position: absolute !important; left: -9999px !important; z-index: -9999 !important;';
                            }
                        }
                    });
                } catch (e) {
                    // 선택자 오류 무시
                }
            });
            
            // 추가 선택자들 처리
            additionalSelectors.forEach(selector => {
                try {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        const parent = el.closest('section[data-testid="stSidebar"]');
                        const isInSidebar = parent !== null;
                        
                        if (isInSidebar || el.getAttribute('data-testid') || el.getAttribute('aria-label')) {
                            try {
                                if (el && el.parentNode) {
                                    el.parentNode.removeChild(el);
                                    removedCount++;
                                }
                            } catch (e) {
                                el.style.cssText = 'display: none !important; visibility: hidden !important; opacity: 0 !important; width: 0 !important; height: 0 !important; pointer-events: none !important; position: absolute !important; left: -9999px !important; z-index: -9999 !important;';
                            }
                        }
                    });
                } catch (e) {
                    // 선택자 오류 무시
                }
            });
            
            // 아이콘 버튼 다시 찾기 (여러 번 실행)
            if (findAndRemoveIconButton()) {
                console.log('Sidebar button removed on first try');
            }
            
            // 추가: 사이드바의 첫 번째 자식 요소 중 버튼이 있으면 제거
            try {
                const sidebar = document.querySelector('section[data-testid="stSidebar"]');
                if (sidebar) {
                    const firstChild = sidebar.firstElementChild;
                    if (firstChild && firstChild.tagName === 'BUTTON' || 
                        (firstChild && firstChild.querySelector && firstChild.querySelector('button'))) {
                        const btn = firstChild.tagName === 'BUTTON' ? firstChild : firstChild.querySelector('button');
                        if (btn && (btn.getAttribute('aria-label') || btn.getAttribute('data-testid'))) {
                            btn.remove();
                            removedCount++;
                        }
                    }
                }
            } catch (e) {
                // 무시
            }
            
            if (removedCount > 0) {
                console.log('Sidebar buttons removed:', removedCount);
            }
        }
        
        // 실행 함수
        function executeRemoval() {
            console.log('🔄 Executing sidebar button removal...');
            const result = findAndRemoveIconButton();
            removeSidebarButtons();
            return result;
        }
        
        // 즉시 실행 (여러 번) - 아이콘 버튼 제거 우선
        executeRemoval();
        setTimeout(executeRemoval, 0);
        setTimeout(executeRemoval, 10);
        setTimeout(executeRemoval, 50);
        
        // DOMContentLoaded 이벤트
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                console.log('📄 DOMContentLoaded event fired');
                executeRemoval();
                setTimeout(executeRemoval, 10);
                setTimeout(executeRemoval, 50);
                setTimeout(executeRemoval, 100);
                setTimeout(executeRemoval, 200);
            });
        } else {
            console.log('📄 DOM already loaded');
            executeRemoval();
            setTimeout(executeRemoval, 10);
            setTimeout(executeRemoval, 50);
            setTimeout(executeRemoval, 100);
            setTimeout(executeRemoval, 200);
        }
        
        // 짧은 간격으로 반복 실행 (동적 생성 대응)
        const intervals = [100, 200, 500, 1000, 2000, 3000, 5000];
        intervals.forEach(delay => {
            setTimeout(executeRemoval, delay);
        });
        
        // MutationObserver로 DOM 변경 감지 (동적 생성 대응)
        const observer = new MutationObserver(function(mutations) {
            let shouldRemove = false;
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(function(node) {
                        if (node.nodeType === 1) { // Element node
                            const testId = node.getAttribute && node.getAttribute('data-testid');
                            const ariaLabel = node.getAttribute && node.getAttribute('aria-label');
                            // stIconMaterial이나 keyboard_double_arrow_left가 포함된 경우도 감지
                            if (testId && (testId.includes('Sidebar') && testId.includes('Control')) ||
                                testId === 'stIconMaterial' ||
                                (ariaLabel && (ariaLabel.includes('sidebar') || ariaLabel.includes('Sidebar'))) ||
                                (node.textContent && node.textContent.includes('keyboard_double_arrow_left'))) {
                                shouldRemove = true;
                            }
                        }
                    });
                }
            });
            if (shouldRemove) {
                setTimeout(() => { findAndRemoveIconButton(); removeSidebarButtons(); }, 0);
                setTimeout(() => { findAndRemoveIconButton(); removeSidebarButtons(); }, 10);
            }
        });
        
        // body 전체 감시
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['data-testid', 'aria-label', 'class']
            });
        }
        
        // window load 이벤트
        window.addEventListener('load', function() {
            findAndRemoveIconButton();
            removeSidebarButtons();
            setTimeout(() => { findAndRemoveIconButton(); removeSidebarButtons(); }, 100);
            setTimeout(() => { findAndRemoveIconButton(); removeSidebarButtons(); }, 500);
        });
        
        // Streamlit rerun 이벤트 대응 (iframe 내부)
        if (window.parent && window.parent !== window) {
            window.parent.addEventListener('load', removeSidebarButtons);
        }
        
        // 주기적 체크 (최후의 수단) - 아이콘 버튼 우선 제거
        setInterval(executeRemoval, 2000);
        
        // Streamlit rerun 감지 (iframe 내부에서 실행되는 경우)
        if (window.parent && window.parent !== window) {
            window.parent.addEventListener('load', executeRemoval);
        }
        
        // 추가: requestAnimationFrame으로도 실행
        function rafRemoval() {
            requestAnimationFrame(() => {
                executeRemoval();
                rafRemoval();
            });
        }
        // 너무 자주 실행하지 않도록 제한
        let rafCount = 0;
        function limitedRafRemoval() {
            requestAnimationFrame(() => {
                if (rafCount % 10 === 0) { // 10프레임마다 실행
                    executeRemoval();
                }
                rafCount++;
                limitedRafRemoval();
            });
        }
        limitedRafRemoval();
    })();
</script>
""", unsafe_allow_html=True)

# ============================================
# 세션 상태 초기화
# ============================================
def init_session_state():
    """세션 상태 초기화"""
    defaults = {
        "messages": [],
        "selected_job": None,
        "selected_company": None,
        "interview_data": None,
        "client": None,
        "면접_시작": False,
        "first_question_generated": False,
        "processing": False,
        "processed_audio_hash": None,
        "last_user_message": None,
        "last_audio_played": None,
        "audio_input_counter": 0,
        "profile_image": None,
        "is_recording": False,
        "current_status_text": "",
        "api_key": "",
        "question_count": 0,  # 현재 질문 개수 (0부터 시작)
        "current_phase": "intro",  # 현재 단계: 'intro', 'job', 'personality', 'company', 'closing'
        "interview_report": None,  # 면접 결과 리포트 (JSON)
        "analyzing_report": False,  # 리포트 분석 중 플래그
        "interview_finished": False,  # 면접 종료 상태 플래그
        "stt_model": "OpenAI Whisper",  # STT 모델 선택: "OpenAI Whisper" or "Daglo"
        "stt_raw_data": None,  # STT Raw Data (디버깅용)
        "debug_raw_data": None,  # STT Raw Data 영구 보존용
        "debug_text": None  # 변환된 텍스트 영구 보존용
    }
    
    for key, default_value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = default_value

init_session_state()

# ============================================
# 유틸리티 함수
# ============================================
@st.cache_data
def load_interview_data() -> Optional[Dict[str, Any]]:
    """
    interview_data.json 파일을 로드합니다.
    
    Returns:
        면접 데이터 딕셔너리 또는 None (실패 시)
    """
    try:
        json_path = Path(__file__).parent / "interview_data.json"
        if not json_path.exists():
            logger.error(f"interview_data.json 파일을 찾을 수 없습니다. 경로: {json_path}")
            st.error(f"interview_data.json 파일을 찾을 수 없습니다. 경로: {json_path}")
            return None
        
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        logger.info("면접 데이터 로드 성공")
        return data
    except json.JSONDecodeError as e:
        error_msg = str(e).encode('utf-8', errors='ignore').decode('utf-8')
        logger.error(f"JSON 파일 파싱 오류: {error_msg}")
        st.error(f"JSON 파일 파싱 오류: {error_msg}")
        return None
    except Exception as e:
        error_msg = str(e).encode('utf-8', errors='ignore').decode('utf-8')
        logger.error(f"파일 로드 오류: {error_msg}")
        st.error(f"파일 로드 오류: {error_msg}")
        return None

@st.cache_resource
def initialize_openai_client(api_key: str) -> Optional[OpenAI]:
    """
    OpenAI 클라이언트를 초기화합니다.
    
    Args:
        api_key: OpenAI API 키
        
    Returns:
        OpenAI 클라이언트 인스턴스 또는 None (실패 시)
    """
    if not api_key or api_key.strip() == "":
        logger.warning("API 키가 제공되지 않았습니다.")
        return None
    try:
        client = OpenAI(api_key=api_key.strip())
        logger.info("OpenAI 클라이언트 초기화 성공")
        return client
    except Exception as e:
        error_msg = str(e).encode('utf-8', errors='ignore').decode('utf-8')
        logger.error(f"OpenAI 클라이언트 초기화 오류: {error_msg}")
        st.error(f"OpenAI 클라이언트 초기화 오류: {error_msg}")
        return None

def extract_companies_from_questions(questions: List[str]) -> List[str]:
    """
    기출_질문 리스트에서 회사명을 추출합니다.
    
    Args:
        questions: 질문 리스트
        
    Returns:
        회사명 리스트 (정렬됨)
    """
    companies = set()
    
    if not questions:
        return ["공통(회사선택X)"]
    
    for question in questions:
        if not isinstance(question, str):
            continue
        # [회사명] 형식 추출
        match = re.search(r'\[([^\]]+)\]', question)
        if match:
            company = match.group(1)
            companies.add(company)
    
    # "공통(회사선택X)"을 맨 앞에, 나머지는 정렬
    company_list = ["공통(회사선택X)"] + sorted([c for c in companies if c != "공통" and c != "전체"])
    
    # 회사가 하나도 없으면 "공통(회사선택X)"만 반환
    if len(company_list) == 1:
        return company_list
    
    return company_list

def filter_questions_by_company(questions: List[str], selected_company: str) -> List[str]:
    """
    선택된 회사에 따라 질문을 필터링합니다.
    
    Args:
        questions: 전체 질문 리스트
        selected_company: 선택된 회사명
        
    Returns:
        필터링된 질문 리스트
    """
    if selected_company == "공통(회사선택X)":
        return questions
    
    filtered = []
    for question in questions:
        # [공통] 또는 [선택된 회사] 태그가 있는 질문만 포함
        match = re.search(r'\[([^\]]+)\]', question)
        if match:
            company_tag = match.group(1)
            if company_tag == "공통" or company_tag == selected_company:
                filtered.append(question)
    
    return filtered

def remove_company_tag_from_question(question: str) -> str:
    """
    질문에서 [회사명] 태그를 제거합니다.
    
    Args:
        question: 회사 태그가 포함된 질문
        
    Returns:
        태그가 제거된 질문
    """
    return re.sub(r'\[([^\]]+)\]\s*', '', question).strip()

def get_current_phase(question_count: int) -> str:
    """
    현재 질문 카운트에 따라 단계를 반환합니다.
    
    Args:
        question_count: 현재 질문 개수
        
    Returns:
        현재 단계 ('intro', 'job', 'personality', 'closing')
    """
    if question_count == 0:
        return "intro"
    elif 1 <= question_count <= 4:
        return "intro"
    elif 5 <= question_count <= 14:
        return "job"
    elif 15 <= question_count <= 18:
        return "personality"
    elif question_count >= 19:
        return "closing"
    else:
        return "closing"

def analyze_interview(client: OpenAI, messages: list, selected_job: str) -> Optional[Dict[str, Any]]:
    """
    면접 대화 로그를 분석하여 결과 리포트를 생성합니다.
    
    Args:
        client: OpenAI 클라이언트
        messages: 면접 대화 내역 리스트
        selected_job: 지원 직군
    
    Returns:
        분석 결과 딕셔너리 또는 None
    """
    if not messages or len(messages) == 0:
        return None
    
    # 대화 로그를 텍스트로 변환
    conversation_text = ""
    for msg in messages:
        role = "면접관" if msg["role"] == "assistant" else "지원자"
        conversation_text += f"[{role}]: {msg['content']}\n\n"
    
    system_prompt = ANALYSIS_SYSTEM_PROMPT

    user_prompt = f"""다음은 '{selected_job}' 직군 지원자의 면접 대화 로그입니다. 이를 분석하여 상세한 피드백 리포트를 작성해주세요.

[면접 대화 로그]
{conversation_text}

[🚨 중요 지시사항]
1. **할루시네이션 절대 금지:** 지원자가 실제로 한 말만 인용하고, 지어내지 마세요.
2. **복사 금지:** '개선 가이드'에 지원자가 이미 말한 내용을 그대로 쓰지 마세요. 새로운 관점이나 더 나은 표현만 제안하세요.
3. **3단계 구조 필수:** 각 문항 분석 시 반드시 "🗣️ 지원자 답변 요약" -> "⚖️ 평가" -> "💡 개선 가이드" 순서를 지키세요.

[요구사항]
- total_score는 5개 항목의 평균 점수로 계산하세요
- pass_prediction은 "합격", "합격 보류 (B+)", "불합격" 중 하나로 판단하세요
- summary_title은 종합 평가를 한 문장으로 요약한 제목을 작성하세요
- detailed_feedback_markdown은 A4 용지 2~3장 분량의 매우 상세한 마크다운 형식 리포트여야 합니다
- detailed_feedback_markdown에는 다음 섹션이 모두 포함되어야 합니다:
  1. 종합 평가 (긴 서술형)
  2. 문항별 정밀 분석 (각 질문마다 반드시 "🗣️ 지원자 답변 요약" -> "⚖️ 평가" -> "💡 개선 가이드" 구조로 작성)
  3. 역량별 심층 평가 (각 항목에 대한 근거와 설명)
- scores는 각 역량별 점수를 포함하세요
- feedback의 good_points와 bad_points는 각각 2-3개씩 구체적으로 작성하세요
- improvement_guide는 실용적인 조언을 제공하세요
- best_answer와 worst_answer는 실제 질문 내용을 참고하여 작성하세요

[문항별 분석 포맷 예시]
## Q1. 자기소개
- **🗣️ 지원자 답변 요약:** (지원자가 실제로 한 말을 1~2문장으로 요약)
- **⚖️ 평가:** (잘한 점과 아쉬운 점 분석)
- **💡 개선 가이드:** (지원자가 말하지 않은 새로운 관점이나 더 나은 표현 제안. 이미 잘했으면 칭찬)

반드시 다음 JSON 포맷으로만 응답하세요:
{{
  "total_score": 75,
  "pass_prediction": "합격 보류 (B+)",
  "summary_title": "직무 이해도는 높으나, 자신감 있는 태도 보완이 시급함",
  "scores": {{
    "job_fit": 80,
    "logic": 60,
    "game_sense": 70,
    "attitude": 90,
    "communication": 85
  }},
  "feedback": {{
    "good_points": ["두괄식 답변이 명확함", "넷마블 게임에 대한 이해도가 높음"],
    "bad_points": ["경험을 물을 때 추상적으로 대답함", "수치적인 근거(KPI 등) 언급이 부족함"],
    "improvement_guide": "직무 경험을 말할 때 STAR 기법(상황-과제-행동-결과)을 사용하여 구체성을 높이세요."
  }},
  "best_answer": "BM 구조 개선안에 대한 답변",
  "worst_answer": "갈등 해결 경험에 대한 답변",
  "detailed_feedback_markdown": "# 1. 종합 평가\\n\\n(전체적인 강점, 약점, 합격 가능성을 서술형으로 작성)\\n\\n# 2. 문항별 정밀 분석\\n\\n## Q1. [질문 내용 요약]\\n- **🗣️ 지원자 답변 요약:** (지원자가 실제로 한 말을 1~2문장으로 요약)\\n- **⚖️ 평가:** (잘한 점과 아쉬운 점 분석)\\n- **💡 개선 가이드:** (지원자가 말하지 않은 더 좋은 표현이나 논리 보강 제안)\\n\\n## Q2. [질문 내용 요약]\\n(모든 문항 반복...)\\n\\n# 3. 역량별 심층 평가\\n(5대 역량에 대한 구체적 평가)"
}}"""

    try:
        # response_format을 사용하여 JSON 응답 강제
        try:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                max_tokens=4000,
                response_format={"type": "json_object"}
            )
        except Exception:
            # response_format이 지원되지 않는 경우 일반 요청으로 재시도
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                max_tokens=4000
            )
        
        result_text = response.choices[0].message.content
        
        # JSON 파싱 시도
        try:
            result = json.loads(result_text)
            # 필수 필드 검증
            if "total_score" not in result or "scores" not in result:
                raise ValueError("필수 필드가 누락되었습니다.")
            return result
        except (json.JSONDecodeError, ValueError) as e:
            # JSON 파싱 실패 시 텍스트에서 JSON 추출 시도
            import re
            json_match = re.search(r'\{.*\}', result_text, re.DOTALL)
            if json_match:
                try:
                    result = json.loads(json_match.group())
                    # 필수 필드 검증
                    if "total_score" not in result or "scores" not in result:
                        raise ValueError("필수 필드가 누락되었습니다.")
                    return result
                except (json.JSONDecodeError, ValueError):
                    pass
            
            try:
                error_msg = str(e).encode('utf-8', errors='ignore').decode('utf-8')
            except:
                error_msg = "분석 결과를 파싱할 수 없습니다."
            st.error(f"분석 결과를 파싱할 수 없습니다: {error_msg}")
            try:
                result_preview = result_text[:500].encode('utf-8', errors='ignore').decode('utf-8')
                st.error(f"원본 응답: {result_preview}...")
            except:
                pass
            return None
                
    except Exception as e:
        try:
            error_msg = str(e).encode('utf-8', errors='ignore').decode('utf-8')
        except:
            error_msg = "면접 분석 중 오류가 발생했습니다."
        st.error(f"면접 분석 오류: {error_msg}")
        return None

def build_system_prompt(
    interview_data: Dict[str, Any], 
    selected_job: str, 
    selected_company: str, 
    question_count: int
) -> str:
    """
    회사 맞춤형 페르소나 및 질문 시나리오 생성 (통합 로직).
    
    question_count에 따라 stage_instruction을 동적으로 생성합니다.
    
    Args:
        interview_data: 면접 데이터 딕셔너리
        selected_job: 선택된 직군
        selected_company: 선택된 회사
        question_count: 현재 질문 개수
        
    Returns:
        시스템 프롬프트 문자열
    """
    common_criteria = "\n".join([f"- {c}" for c in interview_data.get("공통_평가_기준", [])])
    job_data = interview_data.get("직군별_데이터", {}).get(selected_job, {})
    keywords = ", ".join(job_data.get("필수_키워드", []))
    
    # 회사 선택에 따른 페르소나 설정
    if "공통" in selected_company or "선택X" in selected_company or selected_company == "공통(회사선택X)":
        # 공통 선택 시: 특정 회사 이름 언급 금지
        company_context = "일반적인 게임 회사 (General Game Company)"
        company_instruction = """
## [회사 이름 언급 금지 - 절대 규칙]

당신은 특정 회사가 아닌, '일반적인 게임 회사'의 면접관입니다.

**대화 중에 절대 회사 이름을 지어내거나 특정하지 마세요.**
- "이븐아이 게임즈", "넥슨", "넷마블" 등 어떤 회사 이름도 언급하지 마세요.
- 회사를 지칭할 때는 오직 **'우리 회사'** 또는 **'지원하신 회사'**라고만 말하세요.

**올바른 예시:**
- ✅ "우리 회사에 지원한 동기는 무엇인가요?"
- ✅ "지원하신 회사에 대해 어떻게 생각하시나요?"
- ✅ "우리 회사의 게임을 플레이해보셨나요?"

**잘못된 예시:**
- ❌ "이븐아이 게임즈에 지원한 동기는 무엇인가요?" (회사 이름 지어내기 금지)
- ❌ "넥슨 게임즈의 게임을 플레이해보셨나요?" (회사 이름 언급 금지)
"""
    else:
        # 특정 회사 선택 시: 해당 회사 이름 사용
        company_context = selected_company
        company_instruction = f"당신은 '{company_context}' 회사의 면접관입니다. 회사 이름을 언급해도 되지만, 자연스럽게 사용하세요."
    
    # question_count에 따른 stage_instruction 생성
    stage_instruction = ""
    
    if question_count == 0:
        # 도입: 자기소개 요청
        stage_instruction = """
## [시나리오 통제] 지금은 0번째 질문입니다. 반드시 다음만 하세요:

"반갑습니다. 긴장하지 마시고 편안하게 1분 자기소개 부탁드립니다."

⚠️ 오직 자기소개 요청만 하세요. 다른 말은 하지 마세요.
"""
    elif question_count == 1:
        # 동기
        stage_instruction = """
## [시나리오 통제] 지금은 1번째 질문입니다. 반드시 다음 질문만 하세요:

"게임업계를 희망하는 동기와 우리 회사에 지원한 이유에 대해 말씀해주세요  "

⚠️ 절대 다른 질문을 하지 마세요. 위 질문만 정확히 하세요.
"""
    elif question_count == 2:
        # 직무선택
        stage_instruction = """
## [시나리오 통제] 지금은 2번째 질문입니다. 반드시 다음 질문만 하세요:

"게임회사 직군이 참 다양하고 많은데 많은 직군 중 왜 이 직무를 선택했습니까?"

⚠️ 절대 다른 질문을 하지 마세요. 위 질문만 정확히 하세요.
"""
    elif question_count == 3:
        # 역량
        stage_instruction = """
## [시나리오 통제] 지금은 3번째 질문입니다. 반드시 다음 질문만 하세요:

"그럼 그 직무의 핵심 역량은 무엇이라 생각합니까?"

⚠️ 절대 다른 질문을 하지 마세요. 위 질문만 정확히 하세요.
"""
    elif question_count == 4:
        # 노력
        stage_instruction = """
## [시나리오 통제] 지금은 4번째 질문입니다. 반드시 다음 질문만 하세요:

"그 역량을 갖추기 위해 어떤 구체적인 준비를 했습니까?"

⚠️ 절대 다른 질문을 하지 마세요. 위 질문만 정확히 하세요.
"""
    elif 5 <= question_count <= 14:
        # 기술 질문이 없는 직군 체크
        기술질문없는직군 = ["UI/UX", "애니메이션", "사운드"]
        is_기술질문없는직군 = selected_job in 기술질문없는직군
        
        if is_기술질문없는직군:
            # 기술 질문이 없는 직군: 기본 질문 후 자유롭게 질문
            stage_instruction = f"""
## [시나리오 통제] 지금은 {question_count + 1}번째 질문입니다 (직무 검증 단계).

이 직군은 기술 질문이 없으므로, 기본 질문(자기소개, 지원동기, 직무선택, 역량, 노력)을 마친 후 자유롭게 질문하세요.

**질문 전략:**
1. 먼저 지원자의 이전 답변에 대한 짧은 리액션을 하세요.
2. 지원자의 답변과 경험을 바탕으로 자연스럽게 궁금한 점을 물어보세요.
3. 직무 관련 경험, 포트폴리오, 협업 경험, 문제 해결 능력 등을 자유롭게 탐색하세요.
4. 지원자의 답변이 충분하면 → 자연스러운 전환 문구를 사용하여 새로운 주제의 질문을 하세요.
5. 지원자의 답변이 부족하면 → 꼬리질문으로 압박하세요.
6. 질문을 할 때는 이전 대화 맥락과 자연스럽게 연결하세요.
"""
        else:
            # 직무 검증: JSON의 직무 기출 질문 활용
            all_questions = job_data.get("기출_질문", [])
            
            if selected_company and selected_company != "공통(회사선택X)":
                filtered_questions = filter_questions_by_company(all_questions, selected_company)
            else:
                filtered_questions = all_questions
            
            # 태그 제거된 질문 리스트 생성
            questions_pool = [remove_company_tag_from_question(q) for q in filtered_questions]
            
            if questions_pool:
                # 질문 번호에 따라 순차적으로 선택 (5번째 질문이면 인덱스 0, 6번째면 인덱스 1...)
                question_index = question_count - 5
                if question_index < len(questions_pool):
                    selected_question = questions_pool[question_index]
                else:
                    # 질문이 부족하면 순환
                    selected_question = questions_pool[question_index % len(questions_pool)]
                
                stage_instruction = f"""
## [시나리오 통제] 지금은 {question_count + 1}번째 질문입니다 (직무 검증 단계).

**참고용 질문:**

"{selected_question}"

⚠️ 질문 앞에 있는 [넥슨], [공통] 같은 괄호 태그는 절대 읽지 마세요.
⚠️ 질문 내용이 지원자의 상황(예: 경력직 질문인데 지원자는 신입)과 맞지 않으면, 맥락에 맞게 질문을 변형해서 물어보세요.

**질문 전략:**
1. 먼저 지원자의 이전 답변에 대한 짧은 리액션을 하세요.
2. 지원자의 답변이 충분하면 → "잘 들었습니다. 그럼..." 같은 전환 문구를 사용하여 위 참고용 질문을 자연스럽게 연결하세요.
3. 지원자의 답변이 부족하면 → 꼬리질문으로 압박하세요. 참고용 질문은 나중에 사용하세요.
4. 참고용 질문을 사용할 때도 이전 대화 맥락과 연결하세요.
"""
            else:
                stage_instruction = f"""
## [시나리오 통제] 지금은 {question_count + 1}번째 질문입니다 (직무 검증 단계).

직무 관련 질문을 하세요.

**질문 전략:**
1. 먼저 지원자의 이전 답변에 대한 짧은 리액션을 하세요.
2. 지원자의 답변이 충분하면 → 자연스러운 전환 문구를 사용하여 새로운 주제의 질문을 하세요.
3. 지원자의 답변이 부족하면 → 꼬리질문으로 압박하세요.
4. 질문을 할 때는 이전 대화 맥락과 자연스럽게 연결하세요.
"""
    elif 15 <= question_count <= 18:
        # 인성 검증: JSON의 인성 질문 활용
        common_questions_data = interview_data.get("공통_인성_질문", {})
        # 조직적합도와 직무로열티 질문을 합침
        personality_questions = []
        personality_questions.extend(common_questions_data.get("조직적합도", []))
        personality_questions.extend(common_questions_data.get("직무로열티", []))
        
        if personality_questions:
            # 질문 번호에 따라 순차적으로 선택
            question_index = question_count - 15
            if question_index < len(personality_questions):
                selected_question = personality_questions[question_index]
            else:
                # 질문이 부족하면 순환
                selected_question = personality_questions[question_index % len(personality_questions)]
            
            stage_instruction = f"""
## [시나리오 통제] 지금은 {question_count + 1}번째 질문입니다 (인성 검증 단계).

**참고용 질문:**

"{selected_question}"

⚠️ 질문 앞에 있는 [넥슨], [공통] 같은 괄호 태그는 절대 읽지 마세요.

**질문 전략:**
1. 먼저 지원자의 이전 답변에 대한 짧은 리액션을 하세요.
2. 지원자의 답변이 충분하면 → "잘 들었습니다. 그럼..." 같은 전환 문구를 사용하여 위 참고용 질문을 자연스럽게 연결하세요.
3. 지원자의 답변이 부족하면 → 꼬리질문으로 압박하세요. 참고용 질문은 나중에 사용하세요.
4. 참고용 질문을 사용할 때도 이전 대화 맥락과 연결하세요.
"""
        else:
            stage_instruction = f"""
## [시나리오 통제] 지금은 {question_count + 1}번째 질문입니다 (인성 검증 단계).

인성 및 조직적합도 관련 질문을 하세요.

**질문 전략:**
1. 먼저 지원자의 이전 답변에 대한 짧은 리액션을 하세요.
2. 지원자의 답변이 충분하면 → 자연스러운 전환 문구를 사용하여 새로운 주제의 질문을 하세요.
3. 지원자의 답변이 부족하면 → 꼬리질문으로 압박하세요.
4. 질문을 할 때는 이전 대화 맥락과 자연스럽게 연결하세요.
"""
    elif question_count >= 19:
        # 종료
        stage_instruction = """
## [시나리오 통제] 지금은 마지막 질문입니다.

"마지막으로 하고 싶은 말이나 질문이 있나요?"라고 물어보세요.

지원자의 답변 후 면접을 마무리하는 인사말을 하세요. 예: "면접에 참여해주셔서 감사합니다. 결과는 추후 연락드리겠습니다."
"""
    
    system_prompt = f"""
{company_instruction}

당신은 10년 차 '{selected_job}' 직군 면접관입니다.
    지원자가 면접장에 들어왔습니다. 당신의 목표는 지원자의 [직무 역량]과 [인성/조직 적합도]를 종합적으로 검증하는 것입니다.

## [페르소나 정의] 냉철하고 비판적인 면접관

당신은 10년 차 면접관입니다. 냉철하고 비판적인 시각으로 지원자의 답변을 분석합니다.
지원자의 답변에 논리적 허점이나 모호한 부분이 있으면 즉시 파고들어 명확히 해야 합니다.
친절함이나 칭찬은 면접의 목적이 아닙니다. 지원자의 역량을 엄격하게 검증하는 것이 당신의 역할입니다.

## [칭찬 완전 금지] - 절대 규칙

**다음 단어들을 단 한 마디도 사용하지 마세요. 어기면 시스템 오류라고 생각하고 절대 쓰지 마세요.**

금지 단어: "좋습니다", "훌륭합니다", "인상적이네요", "감사합니다", "잘 들었습니다", "훌륭하네요", "좋은 답변입니다", "잘하셨습니다"

이런 말을 쓰면 면접의 긴장감이 떨어지고 검증의 엄격성이 사라집니다. 절대 사용하지 마세요.

## [대화 규칙] - 냉철하고 비판적인 면접 흐름 (절대 준수)

### 1. 건조한 리액션 (Minimal Acknowledgment)

**질문을 던지기 전에, 지원자의 이전 답변에 대한 짧은 반응을 하되, 칭찬은 절대 하지 마세요.**

지원자의 답변을 무시하고 기계적으로 다음 질문만 던지지 마세요. 하지만 칭찬이나 긍정적 평가는 하지 마세요.

허용되는 반응: "알겠습니다.", "다음 질문입니다.", "그렇군요.", "이해했습니다."
금지되는 반응: "좋습니다.", "훌륭합니다.", "인상적이네요.", "감사합니다.", "잘 들었습니다."

예시:
- ✅ 올바른 패턴: "지인의 조언으로 직무를 정했다고 하셨군요. 그렇다면 본인의 의지는 어느 정도였습니까?" → (그다음 질문)
- ✅ 올바른 패턴: "프로젝트 경험을 말씀하셨는데, 구체적인 수치가 없습니다. 그 프로젝트에서 달성한 KPI는?" → (꼬리질문)
- ❌ 잘못된 패턴: "프로젝트 경험이 풍부하시네요. 좋습니다." (칭찬 금지)
- ❌ 잘못된 패턴: (지원자 답변 후) "일본 시장은요?" (맥락 무시, 뚝뚝 끊김)

### 2. 비판적 수용 (Critical Acceptance)

**지원자의 답변을 듣고 그냥 넘어가지 말고, 논리적 허점이 보이면 즉시 파고들어야 합니다.**

모호한 표현, 추상적인 답변, 근거 없는 주장이 보이면 즉시 비판적으로 질문하세요.

예시:
- 지원자: "최고의 회사라 지원했다"
- ✅ 올바른 반응: "최고라는 기준이 모호합니다. 구체적으로 어떤 수치를 근거로 최고라 하십니까?"
- 지원자: "팀워크가 중요하다고 생각합니다"
- ✅ 올바른 반응: "중요하다고만 말씀하셨는데, 실제로 팀워크를 발휘한 구체적인 사례가 있습니까?"
- 지원자: "성장할 수 있는 환경이 좋아서"
- ✅ 올바른 반응: "성장 환경이 좋다는 것이 구체적으로 무엇을 의미합니까? 어떤 성장을 기대하시나요?"

### 3. 유연한 꼬리 질문 (Adaptive Follow-up)

**지원자의 답변 품질에 따라 전략을 달리하세요.**

**케이스 A: 답변이 짧거나(한 문장), 추상적이거나, '모른다'고 회피할 경우**
- 절대 다음 주제로 넘어가지 마세요.
- 그 내용을 물고 늘어지는 압박 꼬리 질문을 던지세요.
- 예: "그건 너무 추상적입니다. 구체적인 사례를 들어주세요." / "모른다고 하셨는데, 그럼 어떻게 준비하셨나요?" / "한 문장으로만 답변하셨는데, 더 자세히 설명해주세요."

**케이스 B: 답변이 구체적이고 충분할 경우**
- 그때 비로소 **"알겠습니다. 그럼 화제를 돌려서..."** 또는 **"다음 질문입니다."**라며 새로운 기출 질문을 던지세요.
- 칭찬 없이 건조하게 전환하세요.
- 예: "알겠습니다. 그럼 이번에는 다른 주제로..." / "다음 질문입니다. ..." / "그렇군요. 그렇다면..."

### 4. 손절 규칙 (Topic Cut-off)

**지원자가 특정 주제에 대해 '모른다', '경험 없다'고 답변하거나, 답변을 어려워하는 기색이 역력하면 즉시 해당 주제를 중단하세요.**

- 절대 같은 주제로 3번 이상 꼬리질문을 하지 마세요.
- 지원자가 "잘 모릅니다", "경험이 없습니다", "그 부분은 아직 공부하지 못했습니다" 등으로 명확히 답변하면, 더 이상 캐묻지 말고 즉시 화제를 전환하세요.
- 바로 [참고용 질문 데이터베이스]의 완전히 다른 카테고리 질문으로 넘어가세요.

예시:
- 지원자: "그 부분은 잘 모르겠습니다."
- ✅ 올바른 반응: "알겠습니다. 그럼 다른 주제로 넘어가겠습니다. [다른 기출 질문]"
- ❌ 잘못된 반응: "그럼 어떻게 공부하셨나요?" / "그럼 준비는 어떻게 하셨나요?" (같은 주제로 계속 캐묻기)

### 5. 질문 연결성 (Bridging)

**기출 질문을 던질 때도 앞의 맥락과 연결하세요.**

뜬금없이 새로운 주제를 던지지 말고, 이전 대화의 맥락과 자연스럽게 연결하세요.

예시:
- ❌ 잘못된 패턴: (지원자가 프로젝트 경험을 말한 후) "일본 시장은요?" (맥락 단절)
- ✅ 올바른 패턴: (지원자가 프로젝트 경험을 말한 후) "방금 확장성을 언급하셨는데, 그렇다면 구체적으로 일본 시장에 대해서는 어떻게 생각하시나요?" (맥락 연결)
- ✅ 올바른 패턴: (지원자가 협업 경험을 말한 후) "협업 경험을 말씀하셨는데, 갈등 상황에서는 어떻게 대처하셨나요?" (자연스러운 확장)

## [기출 질문 활용 규칙]

### 1. 앵무새 금지 규칙

1. **기출 질문을 활용할 때, 질문 앞에 있는 [넥슨], [공통] 같은 괄호 태그를 절대 읽지 마세요.**
2. 질문 내용이 지원자의 상황(예: 경력직 질문인데 지원자는 신입)과 맞지 않으면, 맥락에 맞게 질문을 변형해서 물어보세요.
3. 질문은 자연스러운 구어체로 바꿔서 말하세요.
4. 한 번에 하나의 질문만 하세요. 질문 폭격을 하지 마세요.

### 2. 맥락 없는 '고유명사' 질문 금지 (Context Check)

기출 질문 리스트에 **특정 국가(일본, 중국 등)**나 지원자가 언급하지 않은 특정 게임이 포함된 경우, 절대 그대로 질문하지 마세요.

**[대응 방법]**

**Case A: 지원자가 해당 국가/게임을 언급했다면**
- 그대로 질문하세요.

**Case B: 언급하지 않았다면**
- **'글로벌 시장'**이나 '경쟁 게임' 같은 **일반적인 단어로 치환(Generalize)**해서 질문하세요.

**Case C: 치환이 어렵다면**
- 그 질문은 건너뛰고 다른 질문을 선택하세요.

**(예시)**
- 기출: "일본 시장 진출 전략은?" 
- (지원자가 일본 언급 안 함) 
- → 수정 질문: "만약 해외 시장에 진출한다면, 어떤 국가를 타겟으로 하고 싶습니까?"
- 기출: "리니지 게임의 장단점은?" 
- (지원자가 리니지 언급 안 함) 
- → 수정 질문: "MMORPG 장르의 경쟁 게임 중 하나를 선택해서 장단점을 분석해보세요."

    ## 평가 기준
    {common_criteria}
    - 필수 키워드: {keywords}

{stage_instruction}
"""
    
    return system_prompt

def transcribe_audio_daglo(audio_file_path: str) -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """
    Daglo API를 사용하여 오디오 파일을 텍스트로 변환합니다 (비동기 Polling 방식).
    
    Smart Backoff 알고리즘을 사용하여 폴링 간격을 점진적으로 증가시킵니다.
    
    Args:
        audio_file_path: 변환할 오디오 파일 경로
        
    Returns:
        tuple: (transcribed_text, raw_data)
        - transcribed_text: 변환된 텍스트 (성공 시), None (실패 시)
        - raw_data: API 응답 원본 데이터 (디버깅용)
    """
    daglo_api_key = os.environ.get("DAGLO_API_KEY")
    if not daglo_api_key:
        st.error("⚠️ DAGLO_API_KEY 환경 변수가 설정되지 않았습니다.")
        return None, None
    
    # Daglo API URL
    base_url = DAGLO_API_BASE_URL
    headers = {
        "Authorization": f"Bearer {daglo_api_key}"
    }
    
    raw_data = {
        "step1_request": None,
        "step1_response": None,
        "step2_polling": [],
        "step3_final_response": None
    }
    
    try:
        # ============================================
        # Step 1: 작업 요청 (POST) - rid 추출
        # ============================================
        logger.info(f"[Daglo STT] Step 1: 작업 요청 시작 - {base_url}")
        
        with open(audio_file_path, "rb") as audio_file:
            files = {"file": audio_file}
            # Content-Type은 multipart/form-data로 자동 설정됨
            response = requests.post(base_url, headers=headers, files=files, timeout=30)
            
            raw_data["step1_request"] = {
                "url": base_url,
                "method": "POST",
                "headers": {k: v for k, v in headers.items() if k != "Authorization"},
                "has_file": True
            }
            
            if response.text:
                try:
                    response_json = response.json()
                    raw_data["step1_response"] = {
                        "status_code": response.status_code,
                        "response": response_json
                    }
                except:
                    raw_data["step1_response"] = {
                        "status_code": response.status_code,
                        "response_text": response.text[:500]
                    }
            else:
                raw_data["step1_response"] = {
                    "status_code": response.status_code,
                    "response": None
                }
        
        logger.info(f"[Daglo STT] Step 1 응답 상태 코드: {response.status_code}")
        
        if response.status_code != 200 and response.status_code != 201:
            error_msg = f"작업 요청 실패 (상태 코드: {response.status_code})"
            if response.text:
                try:
                    error_detail = response.json()
                    error_msg += f": {error_detail}"
                    logger.error(f"[Daglo STT] Step 1 오류 상세: {error_detail}")
                except:
                    error_msg += f": {response.text[:200]}"
                    logger.error(f"[Daglo STT] Step 1 오류 응답: {response.text[:200]}")
            st.error(f"Daglo STT 오류: {error_msg}")
            return None, raw_data
        
        # rid (Request ID) 추출
        response_data = response.json()
        rid = response_data.get("rid")
        
        if not rid:
            st.error("Daglo STT 오류: rid (Request ID)를 받지 못했습니다.")
            logger.error(f"[Daglo STT] Step 1 응답 데이터: {response_data}")
            return None, raw_data
        
        logger.info(f"[Daglo STT] Step 1 완료 - rid: {rid}")
        
        # ============================================
        # Step 2: 상태 확인 루프 (GET & Loop) - Smart Backoff
        # ============================================
        status_url = f"{base_url}/{rid}"
        max_wait_time = DAGLO_MAX_WAIT_TIME
        poll_interval = DAGLO_INITIAL_POLL_INTERVAL  # 초기 폴링 간격
        start_time = time.time()
        poll_count = 0
        
        logger.info(f"[Daglo STT] Step 2: 상태 확인 시작 - {status_url}")
        
        while True:
            elapsed_time = time.time() - start_time
            poll_count += 1
            
            # 최대 대기 시간 체크
            if elapsed_time > max_wait_time:
                error_msg = f"최대 대기 시간({max_wait_time}초)을 초과했습니다. (총 {poll_count}회 폴링 시도)"
                logger.error(f"[Daglo STT] Step 2 타임아웃: {error_msg}")
                st.error(f"Daglo STT 오류: {error_msg}")
                return None, raw_data
            
            # 상태 확인 요청
            poll_response = requests.get(status_url, headers=headers, timeout=10)
            
            if poll_response.text:
                try:
                    poll_data = poll_response.json()
                except:
                    logger.warning(f"[Daglo STT] Step 2 응답 파싱 실패: {poll_response.text[:200]}")
                    poll_data = {}
            else:
                poll_data = {}
            
            # 폴링 로그 저장
            poll_log = {
                "poll_count": poll_count,
                "elapsed_time": round(elapsed_time, 2),
                "status_code": poll_response.status_code,
                "response": poll_data
            }
            raw_data["step2_polling"].append(poll_log)
            
            status = poll_data.get("status", "").lower()
            logger.info(f"[Daglo STT] Step 2 폴링 #{poll_count} - 경과 시간: {round(elapsed_time, 2)}초, 상태: {status}, 간격: {poll_interval:.2f}초")
            
            # 완료 조건: status가 'transcribed'
            if status == "transcribed":
                logger.info(f"[Daglo STT] Step 2 완료 - 상태: {status}")
                raw_data["step3_final_response"] = poll_data
                break
            
            # 대기 조건: status가 'processing' 또는 'analysis'
            elif status in ["processing", "analysis"]:
                logger.debug(f"[Daglo STT] Step 2 대기 중 - 상태: {status}, {poll_interval:.2f}초 후 재시도...")
                time.sleep(poll_interval)
                # Smart Backoff: 점진적으로 대기 시간 증가 (최대 3초)
                poll_interval = min(DAGLO_MAX_POLL_INTERVAL, poll_interval * DAGLO_BACKOFF_MULTIPLIER)
                continue
            
            # 실패 조건
            elif status in ["failed", "error"]:
                error_msg = poll_data.get("error", f"상태: {status}")
                logger.error(f"[Daglo STT] Step 2 실패: {error_msg}")
                st.error(f"Daglo STT 오류: {error_msg}")
                return None, raw_data
            
            # 알 수 없는 상태
            else:
                logger.warning(f"[Daglo STT] Step 2 알 수 없는 상태: {status}, 계속 폴링...")
                time.sleep(poll_interval)
                # Smart Backoff 적용
                poll_interval = min(DAGLO_MAX_POLL_INTERVAL, poll_interval * DAGLO_BACKOFF_MULTIPLIER)
                continue
        
        # ============================================
        # Step 3: 결과 파싱 - sttResults 배열의 transcript 합치기
        # ============================================
        logger.info(f"[Daglo STT] Step 3: 결과 파싱 시작")
        
        final_response = raw_data["step3_final_response"]
        if not final_response:
            st.error("Daglo STT 오류: 최종 응답 데이터가 없습니다.")
            logger.error(f"[Daglo STT] Step 3 오류 - raw_data: {raw_data}")
            return None, raw_data
        
        logger.debug(f"[Daglo STT] Step 3 - 전체 응답 데이터: {json.dumps(final_response, ensure_ascii=False, indent=2)}")
        
        stt_results = final_response.get("sttResults", [])
        
        if not stt_results:
            st.error("Daglo STT 오류: sttResults 배열이 없습니다.")
            logger.error(f"[Daglo STT] Step 3 오류 - 응답 데이터 키: {list(final_response.keys())}")
            return None, raw_data
        
        # sttResults 배열의 모든 transcript 텍스트 합치기
        transcript_parts = []
        for result in stt_results:
            transcript = result.get("transcript", "")
            if transcript:
                transcript_parts.append(transcript)
        
        if not transcript_parts:
            st.error("Daglo STT 오류: transcript 텍스트가 없습니다.")
            logger.error(f"[Daglo STT] Step 3 오류 - sttResults: {stt_results}")
            return None, raw_data
        
        # 모든 transcript를 공백으로 연결
        transcribed_text = " ".join(transcript_parts)
        logger.info(f"[Daglo STT] Step 3 완료 - 변환된 텍스트 길이: {len(transcribed_text)}자")
        logger.debug(f"[Daglo STT] 변환된 텍스트 미리보기: {transcribed_text[:100]}...")
        
        return transcribed_text, raw_data
    
    except requests.exceptions.Timeout:
        error_msg = "요청 시간 초과"
        logger.error(f"[Daglo STT] 예외 발생: {error_msg}")
        st.error(f"Daglo STT 오류: {error_msg}")
        return None, raw_data
    except requests.exceptions.RequestException as e:
        error_msg = str(e).encode('utf-8', errors='ignore').decode('utf-8')
        logger.error(f"[Daglo STT] 네트워크 오류: {error_msg}")
        st.error(f"Daglo STT 오류: {error_msg}")
        return None, raw_data
    except Exception as e:
        error_msg = str(e).encode('utf-8', errors='ignore').decode('utf-8')
        logger.error(f"[Daglo STT] 예외 발생: {error_msg}")
        st.error(f"Daglo STT 오류: {error_msg}")
        return None, raw_data

def transcribe_audio(client: Optional[OpenAI], audio_file_path: str, stt_model: str = "OpenAI Whisper") -> Tuple[Optional[str], Optional[Dict[str, Any]]]:
    """
    오디오 파일을 텍스트로 변환합니다 (STT).
    
    Args:
        client: OpenAI 클라이언트 (Whisper 사용 시 필요)
        audio_file_path: 오디오 파일 경로
        stt_model: STT 모델 선택 ("OpenAI Whisper" or "Daglo")
    
    Returns:
        tuple: (transcribed_text, raw_data)
        - transcribed_text: 변환된 텍스트 (성공 시), None (실패 시)
        - raw_data: API 응답 원본 데이터 (디버깅용, Whisper는 None)
    """
    if stt_model == "Daglo":
        return transcribe_audio_daglo(audio_file_path)
    else:
        # OpenAI Whisper 사용
        if not client:
            st.error("⚠️ OpenAI 클라이언트가 초기화되지 않았습니다.")
            return None, None
        
    try:
        with open(audio_file_path, "rb") as audio_file:
            transcript = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
                language="ko"
            )
            # Whisper도 raw_data 반환 (디버깅용)
            raw_data = {
                "stt_model": "OpenAI Whisper",
                "model": "whisper-1",
                "text": transcript.text,
                "language": "ko",
                "timestamp": time.time()
            }
            # transcript 객체의 다른 속성도 포함 (있는 경우)
            if hasattr(transcript, 'task'):
                raw_data["task"] = transcript.task
            if hasattr(transcript, 'language'):
                raw_data["detected_language"] = transcript.language
            return transcript.text, raw_data
    except Exception as e:
            # 오류 메시지를 안전하게 처리
            try:
                error_msg = str(e).encode('utf-8', errors='ignore').decode('utf-8')
            except:
                error_msg = "음성 인식 중 오류가 발생했습니다."
            st.error(f"음성 인식 오류: {error_msg}")
            return None, None

def get_ai_response(
    client: OpenAI, 
    system_prompt: str, 
    conversation_history: List[Dict[str, str]], 
    is_first: bool = False
) -> Optional[str]:
    """
    AI의 응답을 생성합니다.
    
    Args:
        client: OpenAI 클라이언트
        system_prompt: 시스템 프롬프트
        conversation_history: 대화 내역 리스트
        is_first: 첫 질문 여부
        
    Returns:
        AI 응답 텍스트 또는 None (실패 시)
    """
    try:
        # system_prompt를 UTF-8로 인코딩하여 안전하게 처리
        if isinstance(system_prompt, str):
            system_prompt = system_prompt.encode('utf-8', errors='ignore').decode('utf-8')
        
        messages = [{"role": "system", "content": system_prompt}]
        
        if is_first:
            # 첫 면접 시작 시: 질문 가이드에 따라 정확히 질문하도록 지시
            messages.append({
                "role": "user",
                "content": "면접관님, 면접을 시작해주세요. 시스템 프롬프트의 시나리오 통제 지시사항을 정확히 따르세요."
            })
        else:
            recent_messages = conversation_history[-10:] if len(conversation_history) > 10 else conversation_history
            for msg in recent_messages:
                # 메시지 내용도 UTF-8로 안전하게 처리
                content = msg.get("content", "")
                if isinstance(content, str):
                    content = content.encode('utf-8', errors='ignore').decode('utf-8')
                messages.append({
                    "role": msg["role"],
                    "content": content
                })
        
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=0.9,
            max_tokens=500
        )
        result = response.choices[0].message.content
        # 결과도 UTF-8로 안전하게 처리
        if isinstance(result, str):
            result = result.encode('utf-8', errors='ignore').decode('utf-8')
        return result
    except Exception as e:
        # 오류 메시지를 안전하게 처리 (완전히 ASCII-safe)
        # 모든 예외 메시지 추출 시도를 피하고, 예외 타입만 사용
        error_type = type(e).__name__
        
        # st.error에 전달 (완전히 ASCII-safe한 메시지 - 예외 타입만)
        try:
            # 예외 타입만 표시 (메시지는 표시하지 않음)
            st.error(f"AI Response Error: {error_type}")
        except Exception:
            # 최후의 수단: 완전히 안전한 메시지
            try:
                st.error("AI response generation failed. Please check the logs.")
            except:
                # 모든 방법이 실패하면 로그만 남기고 조용히 실패
                pass
        
        # 로깅은 UTF-8로 안전하게 처리 (한글 포함 가능)
        # exc_info=True를 사용하여 스택 트레이스 기록 (str(e) 호출 없음)
        try:
            logger.error(f"AI 응답 생성 오류: {error_type}", exc_info=True)
        except:
            logger.error("AI 응답 생성 오류 발생", exc_info=True)
        
        return None

def text_to_speech(client: OpenAI, text: str) -> Optional[bytes]:
    """
    텍스트를 음성으로 변환합니다 (TTS).
    
    Args:
        client: OpenAI 클라이언트
        text: 변환할 텍스트
        
    Returns:
        오디오 바이트 데이터 또는 None (실패 시)
    """
    try:
        response = client.audio.speech.create(
            model="tts-1",
            voice="onyx",
            input=text
        )
        return response.content
    except Exception as e:
        # 오류 메시지를 안전하게 처리
        try:
            error_msg = str(e).encode('utf-8', errors='ignore').decode('utf-8')
        except:
            error_msg = "음성 합성 중 오류가 발생했습니다."
        st.error(f"음성 합성 오류: {error_msg}")
        return None

def create_autoplay_audio_component(audio_bytes: bytes, audio_id: str) -> None:
    """
    오디오 자동 재생 및 마이크 입력 제어 컴포넌트 (Safe Mode).
    
    Args:
        audio_bytes: 재생할 오디오 바이트 데이터
        audio_id: 오디오 요소의 고유 ID
    """
    audio_base64 = base64.b64encode(audio_bytes).decode()
    
    html_code = f"""
    <div id="audio-container-{audio_id}"></div>
    <script>
        (function() {{
            const container = document.getElementById('audio-container-{audio_id}');
            if (!container) return;
            
            // 오디오 요소 생성
            const audio = document.createElement('audio');
            audio.id = '{audio_id}';
            audio.src = 'data:audio/mp3;base64,{audio_base64}';
            audio.type = 'audio/mp3';
            audio.style.display = 'none';
            container.appendChild(audio);
            
            // --- [핵심] 마이크 버튼 제어 로직 (Safe Mode) ---
            function toggleMic(disable) {{
                try {{
                    // iframe 밖의 부모 창(Streamlit 메인 UI)에서 요소를 찾음
                    const parentDoc = window.parent.document;
                    // audio_input 위젯의 컨테이너를 찾음 (data-testid 활용)
                    const micContainer = parentDoc.querySelector('[data-testid="stAudioInput"]');
                    
                    if (micContainer) {{
                        if (disable) {{
                            micContainer.style.pointerEvents = 'none'; // 클릭 차단
                            micContainer.style.opacity = '0.5';        // 반투명 처리
                            micContainer.style.filter = 'grayscale(100%)'; // 회색조
                            micContainer.style.transition = 'all 0.3s ease';
                        }} else {{
                            micContainer.style.pointerEvents = 'auto'; // 클릭 허용
                            micContainer.style.opacity = '1';          // 원상 복구
                            micContainer.style.filter = 'none';
                        }}
                    }}
                }} catch (e) {{
                    // 보안 정책 등으로 접근 불가 시 조용히 무시 (앱 크래시 방지)
                    console.log('Mic control skipped:', e);
                }}
            }}

            // 이벤트 리스너 연결
            audio.addEventListener('play', () => toggleMic(true));
            audio.addEventListener('playing', () => toggleMic(true));
            audio.addEventListener('ended', () => toggleMic(false));
            audio.addEventListener('pause', () => toggleMic(false));
            audio.addEventListener('error', () => toggleMic(false)); // 에러 시 잠금 해제

            // 재생 시도
            audio.play().catch(e => console.log('Autoplay blocked:', e));
            
        }})();
    </script>
    """
    
    components.html(html_code, height=0)

def create_download_content(
    report: Dict[str, Any], 
    messages: List[Dict[str, str]], 
    job: str, 
    company: str
) -> str:
    """
    면접 결과 리포트와 대화 내용을 텍스트 파일용 문자열로 생성합니다.
    
    Args:
        report: 면접 분석 리포트 딕셔너리
        messages: 대화 내역 리스트
        job: 지원 직군
        company: 지원 회사
        
    Returns:
        다운로드용 텍스트 문자열
    """
    
    content = []
    
    # 헤더
    content.append("=" * 50)
    content.append("💼 AI 모의면접 결과 리포트")
    content.append(f"📅 일시: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    content.append(f"🎯 지원: {company} / {job}")
    content.append("=" * 50)
    content.append("")
    
    # 1부: 분석 리포트
    content.append("=" * 50)
    content.append("📊 면접 분석 결과")
    content.append("=" * 50)
    content.append("")
    
    # 총점 및 합격 예측
    total_score = report.get('total_score', 0)
    pass_prediction = report.get('pass_prediction', '평가 불가')
    content.append(f"🏆 총점: {total_score}점")
    content.append(f"📊 결과: {pass_prediction}")
    content.append("")
    
    # 역량별 점수
    scores = report.get('scores', {})
    
    if scores:
        content.append("[📈 역량별 점수]")
        for key, label in SCORE_LABELS.items():
            score = scores.get(key, 0)
            content.append(f"  - {label}: {score}점")
        content.append("")
    
    # 종합 피드백
    summary_title = report.get('summary_title', '')
    if summary_title:
        content.append("[📝 종합 피드백]")
        content.append(summary_title)
        content.append("")
    
    # 강점 및 보완점
    feedback = report.get('feedback', {})
    good_points = feedback.get('good_points', [])
    bad_points = feedback.get('bad_points', [])
    
    if good_points:
        content.append("[💪 강점]")
        for point in good_points:
            content.append(f"  - {point}")
        content.append("")
    
    if bad_points:
        content.append("[🔧 보완점]")
        for point in bad_points:
            content.append(f"  - {point}")
        content.append("")
    
    # 상세 피드백 (마크다운 형식)
    detailed_feedback = report.get('detailed_feedback_markdown', '')
    if detailed_feedback:
        content.append("=" * 50)
        content.append("📋 상세 분석 리포트")
        content.append("=" * 50)
        content.append("")
        # 마크다운 형식을 텍스트로 변환 (간단한 정리)
        # 마크다운 헤더 제거하고 텍스트만 추출
        import re
        # 마크다운 헤더 (#, ##, ###) 제거
        cleaned_feedback = re.sub(r'^#+\s*', '', detailed_feedback, flags=re.MULTILINE)
        # 볼드/이탤릭 마크다운 제거
        cleaned_feedback = re.sub(r'\*\*([^*]+)\*\*', r'\1', cleaned_feedback)
        cleaned_feedback = re.sub(r'\*([^*]+)\*', r'\1', cleaned_feedback)
        content.append(cleaned_feedback)
        content.append("")
    
    # 2부: 대화 전문
    content.append("=" * 50)
    content.append("💬 면접 대화 기록 (Script)")
    content.append("=" * 50)
    content.append("")
    
    for idx, msg in enumerate(messages, 1):
        role = "👤 지원자" if msg['role'] == 'user' else "🤖 면접관"
        text = msg.get('content', '').strip()
        if text:
            content.append(f"[{role}]")
            content.append(text)
            content.append("")
    
    return "\n".join(content)

def get_status_html(status_type: str, text: str, is_spinner: bool = False) -> str:
    """상태 배지 HTML 생성 헬퍼 함수"""
    colors = {
        "waiting": ("#e0e7ff", "#3730a3", "#c7d2fe"),
        "processing": ("#fef3c7", "#92400e", "#fde68a"),
        "recording": ("#fee2e2", "#dc2626", "#fecaca"),
        "speaking": ("#dbeafe", "#1e40af", "#bfdbfe"),
    }
    bg, color, border = colors.get(status_type, colors["waiting"])
    
    spinner_icon = "🔵" if is_spinner else ""
    spinner_style = "display:inline-block; animation:spin 2s linear infinite; margin-right:5px;" if is_spinner else ""
    
    return f'<div style="text-align: center; margin-bottom: 15px;"><div style="display: inline-flex; align-items: center; background-color: {bg}; color: {color}; border: 1px solid {border}; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 500; gap: 8px;"><span style="{spinner_style}">{spinner_icon}</span><span>{text}</span></div></div>'

# ============================================
# CSS 스타일 (사이드바 항상 고정) - 중복 제거됨 (상단에 이미 적용)
# ============================================
# 주석: CSS와 JavaScript는 st.set_page_config 바로 아래에 적용됨

# ============================================
# 사이드바
# ============================================
with st.sidebar:
    # 사이드바 렌더링 후 즉시 버튼 제거 스크립트 주입 (매우 강력한 버전)
    components.html("""
    <script>
        (function() {
            function removeBtn() {
                let removed = false;
                
                // 현재 document
                let btn = document.querySelector('[data-testid="stSidebarCollapseButton"]');
                if (btn) {
                    btn.remove();
                    console.log('✅ Sidebar button removed (after sidebar render - current)!');
                    removed = true;
                }
                
                // 부모 document
                try {
                    if (window.parent && window.parent !== window && window.parent.document) {
                        btn = window.parent.document.querySelector('[data-testid="stSidebarCollapseButton"]');
                        if (btn) {
                            btn.remove();
                            console.log('✅ Sidebar button removed (after sidebar render - parent)!');
                            removed = true;
                        }
                    }
                } catch (e) {}
                
                return removed;
            }
            
            // 즉시 실행
            removeBtn();
            
            // 여러 시점에서 재시도
            [0, 10, 50, 100, 200, 500, 1000].forEach(delay => {
                setTimeout(removeBtn, delay);
            });
            
            // 주기적 체크 (100ms마다)
            setInterval(removeBtn, 100);
            
            // MutationObserver
            function setupObs(doc) {
                const obs = new MutationObserver(() => {
                    removeBtn();
                });
                if (doc && doc.body) {
                    obs.observe(doc.body, {
                        childList: true,
                        subtree: true
                    });
                }
            }
            
            setupObs(document);
            try {
                if (window.parent && window.parent !== window && window.parent.document) {
                    setupObs(window.parent.document);
                }
            } catch (e) {}
        })();
    </script>
    """, height=0)
    
    # JSON 데이터 로드
    if st.session_state.interview_data is None:
        st.session_state.interview_data = load_interview_data()
    
    # 탭 생성
    tab1, tab2 = st.tabs(["⚙️ 면접 설정", "📖 사용 가이드"])
    
    # ============================================
    # Tab 1: 면접 설정
    # ============================================
    with tab1:
        if st.session_state.interview_data:
            # 직군 카테고리 정의
            사무직군 = [
                "사업PM",
                "해외사업",
                "마케팅",
                "게임기획",
                "게임운영(서비스)",
                "QA",
                "데이터분석",
                "개발PM",
                "서비스기획",
                "전략기획"
            ]
            
            개발직군 = [
                "프로그래머",
                "엔지니어",
                "UI/UX",
                "애니메이션",
                "사운드"
            ]
            
            # 기술 질문이 없는 직군 (기본 질문 후 자유 질문)
            기술질문없는직군 = ["UI/UX", "애니메이션", "사운드"]
            st.session_state.기술질문없는직군 = 기술질문없는직군
            
            # ============================================
            # 기본 정보
            # ============================================
            st.markdown("#### 📋 기본 정보")
            
            # 직군 카테고리 선택
            job_category = st.radio(
                "직군 카테고리",
                options=["사무직군", "개발직군"],
                horizontal=True
            )
            
            # 선택된 카테고리에 따라 직군 리스트 결정
            if job_category == "사무직군":
                job_list = 사무직군
            else:
                job_list = 개발직군
        
        # 직군 선택
        selected_job = st.selectbox(
            "지원 직군 선택",
            options=job_list,
            index=0 if st.session_state.selected_job is None else (job_list.index(st.session_state.selected_job) if st.session_state.selected_job in job_list else 0)
        )
        st.session_state.selected_job = selected_job
        
        # 직군이 선택되면 회사 목록 설정
        if selected_job:
            # 고정된 회사 리스트
            company_list = [
                "공통(회사선택X)",
                "넥슨",
                "넷마블",
                "엔씨",
                "컴투스",
                "컴투스 홀딩스",
                "크래프톤",
                "스마일게이트",
                "웹젠",
                "조이시티",
                "데브시스터즈",
                "네오위즈"
            ]
            
            # 회사 선택
            # 기본값 설정
            default_index = 0
            if st.session_state.selected_company in company_list:
                default_index = company_list.index(st.session_state.selected_company)
            elif st.session_state.selected_company is None:
                default_index = 0
            else:
                # 선택된 회사가 목록에 없으면 "공통(회사선택X)"으로 초기화
                default_index = 0
                st.session_state.selected_company = "공통(회사선택X)"
            
            selected_company = st.selectbox(
                "회사 선택",
                options=company_list,
                index=default_index,
                help="면접 질문을 필터링할 회사를 선택하세요. '공통(회사선택X)'을 선택하면 모든 질문이 포함됩니다."
            )
            st.session_state.selected_company = selected_company
        else:
            st.session_state.selected_company = None
        
        st.markdown("---")
        
        # ============================================
        # 액션 버튼 (가장 중요) - 항상 표시 (interview_data 조건과 무관)
        # ============================================
        st.markdown("#### 🎯 액션")
        
        # 변수 미리 정의 (스코프 문제 해결)
        min_questions_required = 5
        current_question_count = st.session_state.get("question_count", 0)
        
        # 버튼을 나란히 배치 (항상 표시)
        action_col1, action_col2 = st.columns(2)
        
        with action_col1:
            # 초기화 버튼 (항상 활성화)
            reset_clicked = st.button(
                "🔄 초기화", 
                use_container_width=True, 
                type="primary", 
                key="reset_button_action"
            )
            if reset_clicked:
                st.session_state.messages = []
                st.session_state.면접_시작 = False
                st.session_state.first_question_generated = False
                st.session_state.processing = False
                st.session_state.processed_audio_hash = None
                st.session_state.last_user_message = None
                st.session_state.last_audio_played = None
                st.session_state.audio_input_counter = 0
                st.session_state.is_recording = False
                st.session_state.question_count = 0
                st.session_state.current_phase = "intro"
                st.session_state.interview_report = None
                st.session_state.analyzing_report = False
                st.session_state.interview_finished = False
                st.session_state.debug_raw_data = None
                st.session_state.debug_text = None
                st.rerun()
        
        with action_col2:
            # 면접 종료 및 결과 분석 버튼 (항상 표시, 조건에 따라 활성화/비활성화)
            can_analyze = (
                st.session_state.get("면접_시작", False) and 
                st.session_state.get("messages") and 
                len(st.session_state.get("messages", [])) > 0 and
                current_question_count >= min_questions_required
            )
            
            analyze_clicked = st.button(
                "🏁 종료 및 분석", 
                use_container_width=True, 
                type="primary",
                disabled=not can_analyze,
                key="analyze_button_action"
            )
            if analyze_clicked:
                if st.session_state.get("client"):
                    st.session_state.analyzing_report = True
                    st.rerun()
                else:
                    st.warning("⚠️ API 키를 입력해주세요.")
        
        # 안내 문구 표시 (면접 진행 중이고 질문이 5개 미만일 때만)
        if (st.session_state.get("면접_시작", False) and 
            st.session_state.get("messages") and 
            len(st.session_state.get("messages", [])) > 0):
            if current_question_count < min_questions_required:
                st.caption(f"⚠️ 정확한 분석을 위해 최소 {min_questions_required}개의 질문에 답변해주세요. (현재: {current_question_count}/{min_questions_required})")
        
        st.markdown("---")
        
        # ============================================
        # 고급 설정 (접기)
        # ============================================
        with st.expander("🔽 고급 설정 (STT / API / 프로필)", expanded=False):
            # STT 모델 선택
            st.markdown("##### 🎤 STT 모델 선택")
            stt_model = st.radio(
                "음성 인식 모델",
                options=["OpenAI Whisper", "Daglo"],
                index=0 if st.session_state.get("stt_model", "OpenAI Whisper") == "OpenAI Whisper" else 1,
                help="음성을 텍스트로 변환할 모델을 선택하세요."
            )
            st.session_state.stt_model = stt_model
            
            if stt_model == "Daglo":
                daglo_key = os.environ.get("DAGLO_API_KEY")
                if daglo_key:
                    st.success("✅ Daglo API 키가 설정되어 있습니다.")
                else:
                    st.warning("⚠️ DAGLO_API_KEY 환경 변수를 설정해주세요.")
            
            st.markdown("---")
            
        # API 키 설정 (보안: Secrets 또는 .env에서만 로드, 입력창 제거)
        st.markdown("##### 🔑 API 키 설정")
        
        # API 키 가져오기 (우선순위: Secrets > .env 파일)
        api_key = None
        
        # 1. st.secrets 확인 (배포 환경)
        try:
            api_key = st.secrets.get("OPENAI_API_KEY", None)
        except Exception:
            # secrets가 없거나 접근 불가 시 무시
            pass
        
        # 2. os.environ 확인 (.env 파일 - 개발 환경)
        if not api_key:
            api_key = os.environ.get("OPENAI_API_KEY", None)
            if api_key:
                api_key = api_key.strip() if api_key else None
        
        # API 키 상태 표시 및 클라이언트 초기화
        if api_key:
            # 키가 정상적으로 로드된 경우
            st.session_state.api_key = api_key
            st.session_state.client = initialize_openai_client(api_key)
            if st.session_state.client:
                st.success("✅ 이븐아이 AI 면접관 연결됨")
            else:
                st.error("❌ API 연결 실패. 관리자에게 문의하세요.")
        else:
            # 키가 없는 경우
            st.error("❌ 관리자에게 문의하세요 (API Key Missing)")
            st.session_state.api_key = ""
            st.session_state.client = None
        
        st.markdown("---")
        
        # 면접관 프로필 이미지 업로드
        st.markdown("##### 🖼️ 면접관 프로필 이미지")
        uploaded_image = st.file_uploader(
            "이미지를 업로드하세요 (선택사항)",
            type=["png", "jpg", "jpeg", "gif", "webp"],
            key="profile_image_uploader"
        )
        
        if uploaded_image is not None:
            st.session_state.profile_image = uploaded_image
            st.success("✅ 이미지가 업로드되었습니다!")
            st.image(uploaded_image, width=150)
        elif st.session_state.profile_image is not None:
            st.info("💡 현재 이미지가 설정되어 있습니다.")
            if st.button("🗑️ 이미지 제거", use_container_width=True, key="remove_image"):
                st.session_state.profile_image = None
                st.rerun()
        
    # ============================================
    # Tab 2: 사용 가이드
    # ============================================
    with tab2:
        st.markdown("### 📖 사용 가이드")
        st.markdown("""
        **면접 진행 단계:**
        
        1. **직군 선택** → **회사 선택** → **API 키 입력**
        2. **면접 시작** 버튼 클릭
        3. AI 질문을 **듣고** 답변 **녹음**
        4. 반복하여 면접 진행
        5. **면접 종료 및 결과 분석** 버튼으로 피드백 확인
        """)
        
        st.markdown("---")
        
        st.markdown("### 💡 팁")
        st.markdown("""
        - **답변 시 주의사항:**
          - 결론부터 말하기 (두괄식 답변)
          - 구체적인 수치나 경험 제시
          - 비즈니스 마인드 보여주기
        
        - **최소 5개 질문**에 답변해야 정확한 분석이 가능합니다.
        
        - **고급 설정**에서 STT 모델과 프로필 이미지를 변경할 수 있습니다.
        """)

# ============================================
# 메인 화면: Intro View vs Chat View
# ============================================
if not st.session_state.면접_시작:
    # ============================================
    # Intro View: 면접 시작 전
    # ============================================
    st.markdown("### 💼 AI 실전 모의면접장에 오신 것을 환영합니다")
    
    with st.container(border=True):
        # 프로필 이미지
        if st.session_state.profile_image is not None:
            st.image(st.session_state.profile_image, width=120, use_container_width=False)
        else:
            st.markdown('<div style="font-size: 80px; text-align: center; margin-bottom: 10px;">🧑‍💼</div>', unsafe_allow_html=True)
        
        # 사용 가이드
        st.markdown("""
        <div style="margin: 20px 0;">
            <div style="display: flex; align-items: flex-start; margin-bottom: 16px; padding: 12px; background: #f9fafb; border-radius: 8px; border-left: 3px solid #667eea;">
                <span style="font-size: 20px; margin-right: 12px;">👉</span>
                <span style="font-size: 15px; color: #4b5563;"><strong>1단계:</strong> 사이드바에서 지원 직군을 선택하세요</span>
            </div>
            <div style="display: flex; align-items: flex-start; margin-bottom: 16px; padding: 12px; background: #f9fafb; border-radius: 8px; border-left: 3px solid #667eea;">
                <span style="font-size: 20px; margin-right: 12px;">👉</span>
                <span style="font-size: 15px; color: #4b5563;"><strong>2단계:</strong> 아래 시작 버튼을 눌러 면접을 시작하세요</span>
            </div>
            <div style="display: flex; align-items: flex-start; margin-bottom: 16px; padding: 12px; background: #f9fafb; border-radius: 8px; border-left: 3px solid #667eea;">
                <span style="font-size: 20px; margin-right: 12px;">👉</span>
                <span style="font-size: 15px; color: #4b5563;"><strong>3단계:</strong> AI의 질문을 듣고 마이크 버튼으로 답변하세요</span>
            </div>
        </div>
        """, unsafe_allow_html=True)
    
    # 선택된 직군 및 회사 표시
    if st.session_state.selected_job and st.session_state.get("selected_company"):
        selected_company = st.session_state.get("selected_company", "공통(회사선택X)")
        st.info(f"**선택된 직군:** {st.session_state.selected_job} | **회사:** {selected_company}")
    elif st.session_state.selected_job:
        st.warning("⚠️ 사이드바에서 회사를 선택해주세요")
    else:
        st.warning("⚠️ 사이드바에서 직군을 선택해주세요")
    
    # 시작 버튼
    if st.session_state.client and st.session_state.selected_job and st.session_state.get("selected_company"):
        if st.button("🔥 면접 시작하기", use_container_width=True, type="primary", key="start_interview"):
            st.session_state.면접_시작 = True
            st.session_state.processing = True
            st.rerun()
    else:
        st.button("🔥 면접 시작하기", use_container_width=True, type="primary", key="start_interview_disabled", disabled=True)
        st.caption("직군을 선택하고 API 키를 입력해주세요")

else:
    # 리포트 분석 중이면 분석 수행 (면접이 진행 중이고 메시지가 있을 때만)
    if (st.session_state.get("analyzing_report", False) and 
        not st.session_state.interview_report and 
        st.session_state.messages and 
        len(st.session_state.messages) > 0):
        if st.session_state.client:
            with st.spinner("면접 결과를 분석하는 중입니다..."):
                report = analyze_interview(
                    st.session_state.client,
                    st.session_state.messages,
                    st.session_state.selected_job
                )
                if report:
                    st.session_state.interview_report = report
                    st.session_state.analyzing_report = False
                    st.balloons()
                    st.rerun()
                else:
                    st.session_state.analyzing_report = False
                    st.error("분석에 실패했습니다. 다시 시도해주세요.")
                    st.rerun()
        else:
            st.session_state.analyzing_report = False
            st.warning("⚠️ API 키를 입력해주세요.")
    
    # 리포트가 있으면 리포트 표시, 없으면 채팅 화면 표시
    if st.session_state.interview_report:
    # ============================================
        # Report View: 면접 결과 리포트 (상세 리포트)
    # ============================================
        # 제목과 다운로드 버튼을 한 줄에 배치
        col_title, col_download = st.columns([3, 1])
        
        with col_title:
            st.title("📊 면접 결과 리포트")
        
        with col_download:
            st.write("")  # 공백 (정렬용)
            st.write("")  # 공백 (정렬용)
            # 다운로드용 텍스트 생성
            selected_job = st.session_state.get("selected_job", "미지정")
            selected_company = st.session_state.get("selected_company", "공통(회사선택X)")
            download_content = create_download_content(
                st.session_state.interview_report,
                st.session_state.messages,
                selected_job,
                selected_company
            )
            
            # 파일명 생성 (날짜 포함)
            from datetime import datetime
            date_str = datetime.now().strftime('%Y%m%d_%H%M%S')
            # 파일명에서 특수문자 제거
            safe_company = selected_company.replace("(", "").replace(")", "").replace("/", "_")
            file_name = f"면접결과_{safe_company}_{date_str}.txt"
            
            st.download_button(
                "📄 결과 다운로드",
                data=download_content,
                file_name=file_name,
                mime="text/plain",
                type="primary",
                use_container_width=True
            )
        
        report = st.session_state.interview_report
        scores = report.get("scores", {})
        feedback = report.get("feedback", {})
        total_score = report.get("total_score", 0)
        pass_prediction = report.get("pass_prediction", "평가 불가")
        summary_title = report.get("summary_title", "")
        detailed_feedback = report.get("detailed_feedback_markdown", "")
        
        # scores 키를 한글로 변환하는 딕셔너리
        score_labels = {
            "job_fit": "직무 적합도",
            "logic": "논리성",
            "game_sense": "게임 센스",
            "attitude": "태도",
            "communication": "소통 능력"
        }
        
        # 합격 예측에 따른 이모지와 색상 결정
        if "합격" in pass_prediction and "보류" not in pass_prediction:
            emoji = "✅"
            color = "#10b981"
        elif "보류" in pass_prediction:
            emoji = "⚠️"
            color = "#f59e0b"
        else:
            emoji = "❌"
            color = "#ef4444"
        
        # ============================================
        # Section 1: 헤더 (Score Board)
        # ============================================
        col1, col2, col3 = st.columns([1, 1, 2])
        
        with col1:
            st.metric(
                label="총점",
                value=f"{total_score}점",
                delta=None
            )
        
        with col2:
            st.metric(
                label="합격 예측",
                value=f"{emoji} {pass_prediction}",
                delta=None
            )
        
        with col3:
            # 종합 피드백 요약
            if summary_title:
                st.markdown(f"""
                <div style="padding: 12px; background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid {color};">
                    <p style="margin: 0; font-size: 14px; font-weight: 600; color: #1f2937;">{summary_title}</p>
                </div>
                """, unsafe_allow_html=True)
            else:
                good_points = feedback.get("good_points", [])
                bad_points = feedback.get("bad_points", [])
                summary_text = ""
                if good_points:
                    summary_text += f"**강점**: {good_points[0] if len(good_points) > 0 else ''}"
                if bad_points:
                    if summary_text:
                        summary_text += " | "
                    summary_text += f"**개선**: {bad_points[0] if len(bad_points) > 0 else ''}"
                
                if summary_text:
                    st.markdown(f"""
                    <div style="padding: 12px; background-color: #f8f9fa; border-radius: 8px; border-left: 4px solid {color};">
                        <p style="margin: 0; font-size: 14px; color: #1f2937;">{summary_text}</p>
                    </div>
                    """, unsafe_allow_html=True)
                else:
                    st.info("종합 피드백 요약이 없습니다.")
        
        st.divider()
        
        # 상세 피드백 마크다운이 있으면 우선 표시
        if detailed_feedback:
            # ============================================
            # 상세 리포트 (Long-form)
            # ============================================
            st.markdown("## 📋 상세 분석 리포트")
            
            # 역량 점수 요약 (상단에 간단히 표시)
            st.markdown("#### 📊 역량 점수 요약")
            
            # 각 평가 항목을 progress 바로 표시
            score_items = [
                ("job_fit", "직무 적합도"),
                ("logic", "논리성"),
                ("game_sense", "게임 센스"),
                ("attitude", "태도"),
                ("communication", "소통 능력")
            ]
            
            for score_key, score_label in score_items:
                score_value = scores.get(score_key, 0)
                st.markdown(f"**{score_label}**")
                st.progress(score_value / 100, text=f"{score_value}점")
                st.markdown("")  # 작은 여백
            
            st.divider()
            
            # 상세 피드백 마크다운 표시
            st.markdown(detailed_feedback, unsafe_allow_html=True)
        
        else:
            # 기존 컴팩트 대시보드 (detailed_feedback_markdown이 없는 경우)
            # ============================================
            # Section 2: 상세 분석 (Main Content)
            # ============================================
            col_left, col_right = st.columns([4, 6])
            
            with col_left:
                st.markdown("#### 📊 역량 점수")
                
                # 역량 점수를 progress 바로 표시
                score_items = [
                    ("job_fit", "직무 적합도"),
                    ("logic", "논리성"),
                    ("game_sense", "게임 센스"),
                    ("attitude", "태도"),
                    ("communication", "소통 능력")
                ]
                
                for score_key, score_label in score_items:
                    score_value = scores.get(score_key, 0)
                    st.markdown(f"**{score_label}**")
                    st.progress(score_value / 100, text=f"{score_value}점")
                    st.markdown("")  # 작은 여백
            
            with col_right:
                st.markdown("#### 💬 핵심 피드백")
                
                # Good Points
                good_points = feedback.get("good_points", [])
                if good_points:
                    st.success("**🔵 잘한 점**")
                    for i, point in enumerate(good_points[:3], 1):  # 최대 3개만
                        st.markdown(f"{i}. {point}")
                else:
                    st.info("평가 항목이 없습니다.")
                
                st.markdown("")  # 여백
                
                # Bad Points
                bad_points = feedback.get("bad_points", [])
                if bad_points:
                    st.warning("**🔴 개선이 필요한 점**")
                    for i, point in enumerate(bad_points[:3], 1):  # 최대 3개만
                        st.markdown(f"{i}. {point}")
                else:
                    st.info("평가 항목이 없습니다.")
            
            st.divider()
            
            # ============================================
            # Section 3: 상세 내용 (Collapsible)
            # ============================================
            with st.expander("📝 상세 피드백 및 개선 가이드 보기", expanded=False):
                # 전체 Good & Bad Points
                col_fb1, col_fb2 = st.columns(2)
                
                with col_fb1:
                    st.markdown("**🔵 잘한 점 (전체)**")
                    good_points_all = feedback.get("good_points", [])
                    if good_points_all:
                        for point in good_points_all:
                            st.markdown(f"- {point}")
                    else:
                        st.info("평가 항목이 없습니다.")
                
                with col_fb2:
                    st.markdown("**🔴 개선이 필요한 점 (전체)**")
                    bad_points_all = feedback.get("bad_points", [])
                    if bad_points_all:
                        for point in bad_points_all:
                            st.markdown(f"- {point}")
                    else:
                        st.info("평가 항목이 없습니다.")
                
                st.markdown("---")
                
                # 코치의 조언
                st.markdown("**💡 코치의 조언**")
                improvement_guide = feedback.get("improvement_guide", "")
                if improvement_guide:
                    st.info(improvement_guide)
                else:
                    st.info("개선 가이드가 없습니다.")
                
                st.markdown("---")
                
                # Best & Worst 답변
                col_bw1, col_bw2 = st.columns(2)
                
                with col_bw1:
                    st.markdown("**✅ 최고의 답변**")
                    best_answer = report.get("best_answer", "")
                    if best_answer:
                        st.success(best_answer)
                    else:
                        st.info("평가 항목이 없습니다.")
                
                with col_bw2:
                    st.markdown("**❌ 개선이 필요한 답변**")
                    worst_answer = report.get("worst_answer", "")
                    if worst_answer:
                        st.error(worst_answer)
                    else:
                        st.info("평가 항목이 없습니다.")
        
    else:
        # ============================================
        # Chat View: 면접 진행 중
        # ============================================
        
        # 타이틀 및 진행률 (최상단)
        st.markdown("### 💼 AI 실전 모의면접")
        
        # 진행률 표시 (타이틀 바로 아래)
        if st.session_state.면접_시작:
            phase_names = {
                "intro": "도입부",
                "job": "직무 면접",
                "personality": "인성 면접",
                "company": "로열티 검증",
                "closing": "마무리"
            }
            current_phase_name = phase_names.get(st.session_state.current_phase, "진행 중")
            total_questions = 20
            current_question = st.session_state.question_count
            progress_percent = min((current_question / total_questions) * 100, 100)
            
            st.progress(progress_percent / 100, text=f"{current_question} / {total_questions} ({current_phase_name})")
        
        st.markdown("---")
        
        # ============================================
        # 채팅 영역 (고정 높이 컨테이너 - 스크롤 가능)
        # ============================================
        chat_container = st.container(height=350, border=True)
        with chat_container:
            if not st.session_state.messages:
                st.info("👋 면접을 시작하면 대화가 여기에 표시됩니다.")
            else:
                for message in st.session_state.messages:
                    if message["role"] == "assistant":
                        with st.chat_message("assistant"):
                            st.markdown(message["content"])
                            if "audio" in message:
                                st.audio(message["audio"], format="audio/mp3")
                    else:
                        with st.chat_message("user"):
                            st.markdown(message["content"])
                            if "audio" in message:
                                st.audio(message["audio"], format="audio/mp3")
    
        # ============================================
        # 입력 영역 (고정 위치 - 채팅 컨테이너 바로 아래)
        # ============================================
        if not st.session_state.interview_report:
            st.markdown("#### 🎤 답변 녹음")
            
            # 면접 종료 상태 체크
            if st.session_state.get("interview_finished", False):
                st.info("✅ 면접이 종료되었습니다. 결과 분석 버튼을 눌러주세요.")
                audio_data = None
            else:
                audio_data = st.audio_input(
                    "답변 녹음하기",
                    key=f"audio_input_{st.session_state.audio_input_counter}"
                )
        
        if audio_data is not None:
            st.session_state.audio_input_data = audio_data
        else:
            st.session_state.audio_input_data = None
        
            # 처리 현황 (작게 표시)
            if st.session_state.processing:
                status_text = st.session_state.get('current_status_text', '처리 중...')
                st.caption(f"⏳ {status_text}")
            elif st.session_state.is_recording:
                st.caption("🔴 녹음 중...")
            elif st.session_state.messages and len(st.session_state.messages) > 0:
                last_message = st.session_state.messages[-1]
                if last_message["role"] == "assistant":
                    st.caption("💬 질문 중")
                else:
                    st.caption("🎤 답변 대기 중...")

# ============================================
# 면접 시작: 첫 질문 자동 생성
# ============================================
if (not st.session_state.messages and 
    st.session_state.processing and
    st.session_state.client and 
    st.session_state.selected_job and 
    st.session_state.get("selected_company") and
    st.session_state.interview_data and
    not st.session_state.first_question_generated and
    not st.session_state.get("analyzing_report", False) and
    not st.session_state.get("interview_finished", False)):
    
    st.session_state.current_status_text = "첫 질문 준비 중..."
    
    try:
        selected_company = st.session_state.get("selected_company", "전체/공통")
        
        # 현재 단계 업데이트
        st.session_state.current_phase = get_current_phase(st.session_state.question_count)
        
        # build_system_prompt에 question_count 전달
        system_prompt = build_system_prompt(
            st.session_state.interview_data,
            st.session_state.selected_job,
            selected_company,
            st.session_state.question_count
        )
        ai_response = get_ai_response(
            st.session_state.client,
            system_prompt,
            [],
            is_first=True
        )
        
        if ai_response:
            st.session_state.current_status_text = "음성 생성 중..."
            
            audio_bytes = text_to_speech(st.session_state.client, ai_response)
            
            if audio_bytes:
                st.session_state.messages.append({
                    "role": "assistant",
                    "content": ai_response,
                    "audio": audio_bytes
                })
                # 질문 카운트 증가
                st.session_state.question_count += 1
                # 첫 질문 오디오 재생을 위해 플래그 초기화
                st.session_state.last_audio_played = None
                
                st.session_state.first_question_generated = True
                st.session_state.processing = False
                st.session_state.audio_input_counter += 1
                st.rerun()
        else:
            st.session_state.processing = False
    except Exception as e:
        # 오류 메시지를 안전하게 처리
        try:
            error_msg = str(e).encode('utf-8', errors='ignore').decode('utf-8')
        except:
            error_msg = "첫 질문 생성 중 오류가 발생했습니다."
        st.error(f"첫 질문 생성 오류: {error_msg}")
        st.session_state.processing = False

# ============================================
# 오디오 자동 재생 (강화 버전)
# ============================================
if st.session_state.messages:
    last_ai_message = None
    for message in reversed(st.session_state.messages):
        if message["role"] == "assistant" and "audio" in message:
            last_ai_message = message
            break
    
    if last_ai_message:
        # 메시지 인덱스 기반 고유 ID 생성
        message_index = len(st.session_state.messages) - 1
        for idx, msg in enumerate(st.session_state.messages):
            if msg == last_ai_message:
                message_index = idx
                break
        
        audio_id = f"auto_audio_{message_index}_{hashlib.md5(last_ai_message['content'].encode()).hexdigest()[:8]}"
        
        # 새로운 오디오인지 확인 (더 정확한 중복 방지)
        current_audio_hash = hashlib.md5(last_ai_message["audio"]).hexdigest() if isinstance(last_ai_message["audio"], bytes) else None
        
        if st.session_state.last_audio_played != audio_id:
            # 오디오 자동 재생 컴포넌트 삽입 (Streamlit 컴포넌트 사용)
            try:
                create_autoplay_audio_component(last_ai_message["audio"], audio_id)
                st.session_state.last_audio_played = audio_id
            except Exception as e:
                st.error(f"오디오 재생 오류: {e}")
                # 실패해도 계속 진행
                st.session_state.last_audio_played = audio_id

# ============================================
# 오디오 입력 처리
# ============================================
audio_data = st.session_state.get('audio_input_data', None)

# 면접 종료 상태에서는 오디오 입력 처리하지 않음
if audio_data is not None and not st.session_state.processing and not st.session_state.get("interview_finished", False):
    st.session_state.is_recording = True
    
    if not st.session_state.client:
        st.error("OpenAI API 키를 입력해주세요.")
    elif not st.session_state.selected_job:
        st.error("지원 직군을 선택해주세요.")
    elif not st.session_state.get("selected_company"):
        st.error("회사를 선택해주세요.")
    elif not st.session_state.interview_data:
        st.error("면접 데이터를 로드할 수 없습니다.")
    else:
        audio_bytes = audio_data.read()
        audio_hash = hashlib.md5(audio_bytes).hexdigest()
        
        if audio_hash == st.session_state.processed_audio_hash:
            pass  # 이미 처리된 오디오는 무시
        else:
            st.session_state.processing = True
            st.session_state.processed_audio_hash = audio_hash
            st.session_state.current_status_text = "음성 변환 중..."
            
            
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp_file:
                tmp_file.write(audio_bytes)
                tmp_audio_path = tmp_file.name
            
            try:
                # STT 모델에 따라 변환 수행
                stt_model = st.session_state.get("stt_model", "OpenAI Whisper")
                
                if stt_model == "Daglo":
                    st.session_state.current_status_text = "Daglo 서버에서 변환 중..."
                
                user_text, raw_data = transcribe_audio(
                    st.session_state.client, 
                    tmp_audio_path,
                    stt_model=stt_model
                )
                
                # Raw Data 저장 (디버깅용 - 영구 보존)
                st.session_state.stt_raw_data = raw_data
                st.session_state.debug_raw_data = raw_data  # 영구 보존용
                st.session_state.debug_text = user_text  # 변환된 텍스트 영구 보존
                
                # ============================================
                # [안전장치 2] STT 실패 핸들링
                # ============================================
                if not user_text:
                    st.warning("음성을 인식하지 못했습니다. 다시 시도해 주세요.")
                    st.session_state.processing = False
                    st.session_state.processed_audio_hash = None
                    st.session_state.is_recording = False
                else:
                    # ============================================
                    # [안전장치 1] 입력 유효성 검사
                    # ============================================
                    # 텍스트 길이 및 의미 검사 (공백 제거 후 길이 확인)
                    user_text_trimmed = user_text.strip()
                    if len(user_text_trimmed) < 5:
                        st.warning("😅 답변이 너무 짧거나 인식이 잘 안 되었습니다. 조금 더 구체적으로 말씀해 주세요.")
                        st.session_state.processing = False
                        st.session_state.processed_audio_hash = None
                        st.session_state.is_recording = False
                    elif user_text_trimmed == st.session_state.last_user_message:
                        # 중복 메시지 처리
                        st.session_state.processing = False
                        st.session_state.processed_audio_hash = None
                        st.session_state.is_recording = False
                    else:
                        # 유효한 답변이므로 대화에 추가
                        st.session_state.messages.append({
                            "role": "user",
                            "content": user_text
                        })
                        st.session_state.last_user_message = user_text
                        st.session_state.current_status_text = "분석 중..."
                        
                        selected_company = st.session_state.get("selected_company", "공통(회사선택X)")
                        
                        # 면접 종료 체크: question_count >= 20이면 면접 종료
                        if st.session_state.question_count >= 20:
                            # 면접 종료 메시지 추가
                            end_message = "이상 면접을 마치겠습니다. 고생하셨습니다."
                            st.session_state.messages.append({
                                "role": "assistant",
                                "content": end_message
                            })
                            # 면접 종료 상태로 전환
                            st.session_state.interview_finished = True
                            st.session_state.processing = False
                            st.session_state.processed_audio_hash = None
                            st.session_state.is_recording = False
                            st.rerun()
                        else:
                            # 현재 단계 업데이트
                            st.session_state.current_phase = get_current_phase(st.session_state.question_count)
                            
                            # build_system_prompt에 question_count 전달
                            system_prompt = build_system_prompt(
                                st.session_state.interview_data,
                                st.session_state.selected_job,
                                selected_company,
                                st.session_state.question_count
                            )
                            
                            # ============================================
                            # [안전장치 3] API 오류 시 멈춤 방지
                            # ============================================
                            try:
                                ai_response = get_ai_response(
                                    st.session_state.client,
                                    system_prompt,
                                    st.session_state.messages,
                                    is_first=False
                                )
                                
                                if ai_response:
                                    st.session_state.current_status_text = "음성 생성 중..."
                                    
                                    if 'status_container_inner' in st.session_state:
                                        st.session_state.status_container_inner.markdown(
                                            get_status_html("processing", "음성 생성 중...", True), 
                                            unsafe_allow_html=True
                                        )
                                    
                                    try:
                                        audio_bytes_tts = text_to_speech(st.session_state.client, ai_response)
                                        
                                        if audio_bytes_tts:
                                            st.session_state.messages.append({
                                                "role": "assistant",
                                                "content": ai_response,
                                                "audio": audio_bytes_tts
                                            })
                                            
                                            # 질문 카운트 증가
                                            st.session_state.question_count += 1
                                            
                                            # 새로운 오디오가 추가되었으므로 재생 플래그 초기화
                                            st.session_state.last_audio_played = None
                                            
                                            st.session_state.processed_audio_hash = None
                                            st.session_state.audio_input_counter += 1
                                            st.session_state.is_recording = False
                                            st.session_state.processing = False
                                            st.rerun()
                                        else:
                                            # TTS 실패 시 처리
                                            st.error("📡 서버 연결이 불안정합니다. 잠시 후 다시 답변해 주세요.")
                                            st.session_state.processing = False
                                            st.session_state.processed_audio_hash = None
                                            st.session_state.is_recording = False
                                    except Exception as tts_error:
                                        # TTS API 오류 처리
                                        st.error("📡 서버 연결이 불안정합니다. 잠시 후 다시 답변해 주세요.")
                                        st.session_state.processing = False
                                        st.session_state.processed_audio_hash = None
                                        st.session_state.is_recording = False
                                else:
                                    # AI 응답 생성 실패 시 처리
                                    st.error("📡 서버 연결이 불안정합니다. 잠시 후 다시 답변해 주세요.")
                                    st.session_state.processing = False
                                    st.session_state.processed_audio_hash = None
                                    st.session_state.is_recording = False
                            except Exception as api_error:
                                # LLM API 오류 처리
                                st.error("📡 서버 연결이 불안정합니다. 잠시 후 다시 답변해 주세요.")
                                st.session_state.processing = False
                                st.session_state.processed_audio_hash = None
                                st.session_state.is_recording = False
            except Exception as e:
                # 오류 메시지를 안전하게 처리
                try:
                    error_msg = str(e).encode('utf-8', errors='ignore').decode('utf-8')
                except:
                    error_msg = "오류가 발생했습니다."
                st.error(f"오류 발생: {error_msg}")
                st.session_state.processing = False
                st.session_state.processed_audio_hash = None
                st.session_state.is_recording = False
            finally:
                if os.path.exists(tmp_audio_path):
                    os.unlink(tmp_audio_path)

# ============================================
# Raw Data 표시 (메인 코드 최하단 - 영구 표시)
# ============================================
# debug_text가 있으면 표시 (Whisper/Daglo 모두 지원)
if st.session_state.get('debug_text') or (st.session_state.get('debug_raw_data') is not None):
    st.divider()
    with st.expander("📊 [개발자용] STT Raw Data (결과 확인)", expanded=True):
        st.write("### 📝 변환된 텍스트")
        if st.session_state.get('debug_text'):
            st.write(st.session_state.debug_text)
        else:
            st.info("변환된 텍스트가 없습니다.")
        
        st.write("### 📡 API 응답 JSON")
        if st.session_state.get('debug_raw_data') is not None:
            st.json(st.session_state.debug_raw_data)
        else:
            st.info("Raw Data가 없습니다. (STT 모델: OpenAI Whisper)")
