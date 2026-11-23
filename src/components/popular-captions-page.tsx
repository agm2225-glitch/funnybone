"use client";

import { useEffect, useRef, useState } from "react";
import { fetchPopularCaptionsAction } from "@/app/actions/captions/fetch-popular-captions-action";
import { fetchHumorFlavorsAction } from "@/app/actions/captions/fetch-humor-flavors-action";
import type { HumorFlavorOption } from "@/app/actions/captions/fetch-humor-flavors-action";
import {
  toggleCaptionVoteAction,
  fetchUserCaptionVotesAction,
  insertSaveAction,
  deleteSaveAction,
  fetchSavedCaptionsAction,
} from "@/app/actions/captions";
import { useToast } from "@/hooks/use-toast";
import ShareModal from "@/components/share-modal";
import { IconChevronDown, IconSearch } from "@tabler/icons-react";
import { CaptionGridSkeleton } from "@/components/ui/image-grid-skeleton";
import { useRouter } from "next/navigation";
import { LoginPromptModal } from "@/components/ui/login-prompt-modal";
import { checkAuthStatusAction } from "@/app/actions/auth/check-auth-status";
import Link from "next/link";
import { buildCaptionShareUrl } from "@/utils/site-url";
import { BrandImage } from "@/components/brand-image";
import { CaptionModal } from "@/components/ui/caption-modal";
import { BookmarkButton } from "@/components/ui/bookmark-button";
import { Top100CaptionImage } from "@/components/top-100-caption-image";
import { VoteButtons } from "@/components/ui/vote-buttons";

// functions to load in our pregenrated thumbnails
const THUMBNAIL_SIZES = [320, 480, 640, 750, 828, 1080, 1200, 1920, 2048, 3840] as const;

const parseImageUrl = (url: string) => {
  // expects: https://images.domain.com/<userId>/<imageId>.<ext>
  const match = url.match(/https?:\/\/[^\/]+\/([^\/]+)\/([^\/\?]+)\.([^\/\?\s]+)/);
  if (match) {
    const [, userId, imageId, extension] = match;
    return { userId, imageId, extension };
  }
  return null;
};

const generateThumbnailUrls = (
  baseUrl: string,
  userId: string,
  imageId: string,
  extension: string
) => {
  const basePath = `${baseUrl}/${userId}/${imageId}`;
  return {
    original: `${basePath}.${extension}`,
    srcSet: THUMBNAIL_SIZES.map((size) => `${basePath}-${size}.${extension} ${size}w`).join(", "),
    gridUrl: `${basePath}-${THUMBNAIL_SIZES.find((s) => s >= 640) || 640}.${extension}`,
    blurUrl: `${basePath}-640.${extension}`,
  };
};

type PopularCaption = {
  id: string;
  content: string;
  image_url: string;
  like_count: number;
  is_common_use: boolean;
  created_at: string;
};

type PopularCaptionsFilter = "all" | "year" | "past30" | "week";
type SortOption = "liked" | "recent";

interface PopularCaptionsPageClientProps {
  initialFilter?: PopularCaptionsFilter;
  pastWeekHref?: string;
  pastMonthHref?: string;
  pastYearHref?: string;
  allTimeHref?: string;
  initialCaptions?: PopularCaption[];
  initialUserVotes?: Record<string, 1 | -1 | null>;
  initialIsAuthenticated?: boolean;
}

const filterOptions: Array<{ key: PopularCaptionsFilter; label: string }> = [
  { key: "week", label: "Past Week" },
  { key: "past30", label: "Past Month" },
  { key: "year", label: "Past Year" },
  { key: "all", label: "All Time" },
];

export default function PopularCaptionsPageClient({
  initialFilter = "week",
  pastWeekHref,
  pastMonthHref,
  pastYearHref,
  allTimeHref,
  initialCaptions = [],
  initialUserVotes = {},
  initialIsAuthenticated = false,
}: PopularCaptionsPageClientProps) {
  const [popularCaptions, setPopularCaptions] = useState<PopularCaption[]>(initialCaptions);
  const [userVotes, setUserVotes] = useState<Record<string, 1 | -1 | null>>(initialUserVotes);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const [visibleCount, setVisibleCount] = useState(8);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(initialIsAuthenticated);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [savedCaptions, setSavedCaptions] = useState<string[]>([]);
  const isFirstLoad = useRef(true);

  const [filter, setFilter] = useState<PopularCaptionsFilter>(initialFilter);
  const filterHrefs: Partial<Record<PopularCaptionsFilter, string>> = {
    week: pastWeekHref,
    past30: pastMonthHref,
    year: pastYearHref,
    all: allTimeHref,
  };

  // Search / sort / flavor state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<SortOption>("liked");
  const [flavorId, setFlavorId] = useState<number | null>(null);
  const [flavors, setFlavors] = useState<HumorFlavorOption[]>([]);
  const requestId = useRef(0);
  const itemsPerPageRef = useRef(itemsPerPage);
  const pendingVotes = useRef<Set<string>>(new Set());

  useEffect(() => {
    itemsPerPageRef.current = itemsPerPage;
  }, [itemsPerPage]);

  // Wait 350ms after typing stops before searching
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    fetchHumorFlavorsAction().then(setFlavors);
  }, []);

  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }

    const fetchData = async () => {
      const myRequest = ++requestId.current;
      try {
        setIsLoading(true);
        const captions = await fetchPopularCaptionsAction(100, filter, {
          search: debouncedSearch,
          sort,
          humorFlavorId: flavorId,
        });
        if (myRequest !== requestId.current) return; // a newer request replaced this one

        const auth = await checkAuthStatusAction();
        if (myRequest !== requestId.current) return;

        setIsAuthenticated(auth.isAuthenticated && !auth.isAnonymous);
        setPopularCaptions(captions);
        setVisibleCount(itemsPerPageRef.current);

        // Fetch user votes if authenticated
        if (auth.isAuthenticated && !auth.isAnonymous && captions.length > 0) {
          const captionIds = captions.map((c) => c.id);
          const votes = await fetchUserCaptionVotesAction(captionIds);
          if (myRequest !== requestId.current) return;
          setUserVotes(votes);
          const saved = await fetchSavedCaptionsAction();
          if (myRequest !== requestId.current) return;
          setSavedCaptions(saved.map((caption) => caption.id));
        } else {
          // Clear votes if not authenticated
          setUserVotes({});
          setSavedCaptions([]);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        toast({
          title: "Error",
          description: "Failed to load captions",
        });
      } finally {
        if (myRequest === requestId.current) setIsLoading(false);
      }
    };

    fetchData();
  }, [toast, filter, debouncedSearch, sort, flavorId]);

  useEffect(() => {
    const fetchSavedCaptions = async () => {
      if (!isAuthenticated) {
        setSavedCaptions([]);
        return;
      }

      try {
        const saved = await fetchSavedCaptionsAction();
        setSavedCaptions(saved.map((caption) => caption.id));
      } catch (error) {
        console.error("Error fetching saved captions:", error);
        setSavedCaptions([]);
      }
    };

    fetchSavedCaptions();
  }, [isAuthenticated]);

  const handleVote = async (captionId: string, voteValue: 1 | -1) => {
    if (!isAuthenticated) {
      setShowLoginPrompt(true);
      return;
    }

    // Ignore rapid taps while a vote on this caption is still saving
    if (pendingVotes.current.has(captionId)) return;
    pendingVotes.current.add(captionId);

    const currentVote = userVotes[captionId] ?? null;
    const originalVote = currentVote;
    const originalCount = popularCaptions.find((c) => c.id === captionId)?.like_count || 0;

    // Optimistic update: determine new vote value
    const newVoteValue: 1 | -1 | null = currentVote === voteValue ? null : voteValue;

    // Calculate optimistic count change
    const countChange = (newVoteValue ?? 0) - (originalVote ?? 0);

    // Optimistic UI update
    setUserVotes((prev) => ({
      ...prev,
      [captionId]: newVoteValue,
    }));

    setPopularCaptions((prev) =>
      prev.map((caption) =>
        caption.id === captionId
          ? { ...caption, like_count: caption.like_count + countChange }
          : caption
      )
    );

    try {
      await toggleCaptionVoteAction(captionId, voteValue);
    } catch (error) {
      console.error("Error updating vote:", error);
      // Revert optimistic update
      setUserVotes((prev) => ({
        ...prev,
        [captionId]: originalVote,
      }));
      setPopularCaptions((prev) =>
        prev.map((caption) =>
          caption.id === captionId ? { ...caption, like_count: originalCount } : caption
        )
      );
      toast({
        title: "Error",
        description: "Failed to update vote",
      });
    } finally {
      pendingVotes.current.delete(captionId);
    }
  };

  const handleSlideSave = async (captionId: string) => {
    if (!isAuthenticated) {
      setShowLoginPrompt(true);
      return;
    }

    const originalState = savedCaptions;
    const isSaved = savedCaptions.includes(captionId);

    try {
      if (isSaved) {
        setSavedCaptions((prev) => prev.filter((id) => id !== captionId));
        await deleteSaveAction(captionId);
      } else {
        setSavedCaptions((prev) => [...prev, captionId]);
        await insertSaveAction(captionId);
      }
    } catch (error) {
      console.error("Error saving/unsaving caption:", error);
      setSavedCaptions(originalState);
      toast({
        title: "Error",
        description: "Failed to update favorite.",
      });
    }
  };

  const handleImageClick = (index: number) => {
    setSelectedIndex(index);
  };

  const handleCloseCarousel = () => {
    setSelectedIndex(null);
  };

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && selectedIndex !== null) {
        handleCloseCarousel();
      }
    };

    const handleArrowKeys = (event: KeyboardEvent) => {
      if (selectedIndex === null || popularCaptions.length === 0) return;

      if (event.key === "ArrowLeft") {
        setSelectedIndex((prev) => {
          if (prev === null) return null;
          return prev === 0 ? popularCaptions.length - 1 : prev - 1;
        });
      } else if (event.key === "ArrowRight") {
        setSelectedIndex((prev) => {
          if (prev === null) return null;
          return prev === popularCaptions.length - 1 ? 0 : prev + 1;
        });
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("keydown", handleArrowKeys);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("keydown", handleArrowKeys);
    };
  }, [selectedIndex, popularCaptions.length]);

  const loadMore = () => {
    setVisibleCount((prev) => prev + itemsPerPage);
  };

  const handleItemsPerPageChange = (value: string) => {
    const newValue = parseInt(value);
    setItemsPerPage(newValue);
    setVisibleCount(newValue);
  };

  const visibleCaptions = popularCaptions.slice(0, visibleCount);
  const hasMore = visibleCount < popularCaptions.length;
  const hasActiveFilters = debouncedSearch.trim() !== "" || flavorId !== null || sort !== "liked";

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setSort("liked");
    setFlavorId(null);
  };

  return (
    <div className="container mx-auto px-1 py-1">
      {/* Mobile-only Get Crackd Box */}
      <div className="block sm:hidden w-full mb-8">
        <div
          className="bg-gray-50 dark:bg-neutral-800 rounded-2xl p-8 flex
                      flex-col items-center justify-center"
        >
          <div className="relative w-24 h-24 mb-4">
            <BrandImage variant="mark" alt="Crackd Logo" className="w-full h-full" />
          </div>
          <h2
            className="text-gray-900 dark:text-white text-4xl font-bold
                        tracking-tight scale-y-150"
          >
            GET CRACKD
          </h2>
        </div>
      </div>

      {/* Time period tabs */}
      <div className="flex justify-center mb-8 relative" style={{ height: "44px" }}>
        <div
          className="relative flex justify-between w-full max-w-[470px] h-[36px] sm:h-[44px] 
                      bg-transparent rounded-3xl mx-auto border border-[#666363] overflow-hidden"
        >
          {/* Primary Slider */}
          <div
            className={`absolute top-0 left-0 h-[36px] sm:h-[44px] w-1/4 rounded-[16px] 
              bg-primary dark:bg-primary/40
                       transition-all duration-300 ${
                         filter === "week"
                           ? "rounded-l-3xl rounded-r-none"
                           : filter === "all"
                           ? "rounded-r-3xl rounded-l-none"
                           : "rounded-none"
                       }`}
            style={{
              transform: `translateX(${
                filter === "week"
                  ? 0
                  : filter === "past30"
                  ? 100
                  : filter === "year"
                  ? 200
                  : 300
              }%)`,
            }}
          />

          {/* Buttons */}
          {filterOptions.map(({ key, label }) => {
            const isActive = filter === key;
            const className = `relative w-1/4 h-full flex items-center justify-center
                          text-xs sm:text-sm md:text-base font-normal leading-[120%]
                          tracking-[-0.02em] z-10 transition-colors 
                          duration-200 ${
                            isActive
                              ? "text-white dark:text-white border-2 border-primary"
                              : "text-gray-800 dark:text-[#9A9A9A]"
                          } ${
                            key === "week"
                              ? "rounded-l-3xl rounded-r-none"
                              : key === "all"
                              ? "rounded-r-3xl rounded-l-none"
                              : "rounded-none"
                          }`;

            const href = filterHrefs[key];
            if (href) {
              return (
                <Link key={key} href={href} className={className}>
                  {label}
                </Link>
              );
            }

            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={className}
              >
                {label}
              </button>
            );
          })}

          {/* Vertical Borders */}
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-[2px] bg-[#666363]"
              style={{ left: `${i * 25}%` }}
            />
          ))}
        </div>
      </div>

      {/* Search, sort, and humor flavor controls */}
      <div className="mx-auto mb-6 flex w-full max-w-7xl flex-col gap-3 px-4 sm:flex-row">
        <div className="relative flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search captions..."
            aria-label="Search captions"
            className="h-11 w-full rounded-full border border-primary/20 bg-background/30 pl-10 pr-4 text-sm"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          aria-label="Sort captions"
          className="h-11 rounded-full border border-primary/20 bg-background px-4 text-sm"
        >
          <option value="liked">Most liked</option>
          <option value="recent">Most recent</option>
        </select>
        <select
          value={flavorId ?? ""}
          onChange={(e) => setFlavorId(e.target.value ? Number(e.target.value) : null)}
          aria-label="Filter by humor flavor"
          className="h-11 rounded-full border border-primary/20 bg-background px-4 text-sm"
        >
          <option value="">All humor flavors</option>
          {flavors.map((f) => (
            <option key={f.id} value={f.id}>
              {f.slug}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 w-full flex flex-col gap-8 p-4 relative">
        <div className="flex justify-end items-center w-full max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Show</span>
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-2 bg-background/30 border border-primary/20
                            rounded-lg px-3 py-1.5 text-sm text-primary
                            hover:border-primary/40 transition-colors duration-200"
              >
                {itemsPerPage}
                <IconChevronDown className="w-4 h-4" />
              </button>
              {isDropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-20 bg-background/90 border
                                  border-primary/20 rounded-lg shadow-lg overflow-hidden z-50"
                >
                  {[4, 8, 12, 16, 20, 24].map((value) => (
                    <button
                      key={value}
                      onClick={() => {
                        handleItemsPerPageChange(value.toString());
                        setIsDropdownOpen(false);
                      }}
                      className="w-full px-3 py-2 text-sm text-primary hover:bg-primary/10
                                  transition-colors duration-200 text-left"
                    >
                      {value}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <span className="text-sm text-muted-foreground">at a time</span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <CaptionGridSkeleton count={8} />
      ) : visibleCaptions.length === 0 ? (
        <div className="mt-12 flex flex-col items-center gap-3 text-center">
          <p className="text-lg text-gray-400">
            {hasActiveFilters ? "No captions match your search." : "No captions found."}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="h-11 rounded-full bg-primary/20 px-6 text-primary
                         transition-colors duration-200 hover:bg-primary/30"
            >
              Clear search and filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {visibleCaptions.map((caption, index) => {
            // generate our thumbnail urls
            const info = parseImageUrl(caption.image_url);
            let displayUrl = caption.image_url;

            let srcSet: string | undefined;
            if (info) {
              const baseUrl = caption.image_url.split("/").slice(0, 3).join("/");
              const t = generateThumbnailUrls(baseUrl, info.userId, info.imageId, info.extension);
              displayUrl = t.gridUrl;
              srcSet = t.srcSet;
            }

            const shareUrl = buildCaptionShareUrl(caption.id);
            const currentVote = userVotes[caption.id] ?? null;

            return (
              <div
                key={caption.id}
                className="relative cursor-pointer group w-full h-full flex"
                onClick={() => handleImageClick(index)}
              >
                <div
                  className="relative bg-white dark:bg-[#1a1a1a] rounded-lg overflow-hidden
                         shadow-md dark:shadow-lg ring-1 ring-gray-200 dark:ring-0
                         hover:shadow-xl transition-all duration-300 flex flex-col w-full
                         sm:max-w-[320px] sm:mx-auto"
                >
                  {/* Top Section - Branding */}
                  <div className="p-3 flex justify-between items-center">
                    {/* Left: Crackd branding */}
                    <div className="flex items-center gap-2">
                      <BrandImage variant="mark" alt="Crackd" className="w-6 h-6" />
                      <span className="text-primary text-sm font-bold">Crackd</span>
                    </div>

                    {/* Right: Upvote/Downvote counter */}
                    <VoteButtons
                      count={caption.like_count}
                      userVote={currentVote}
                      onVote={(value) => handleVote(caption.id, value)}
                    />
                  </div>

                  {/* Caption Text - Below header */}
                  <div className="px-3 pb-3">
                    <p
                      className="text-gray-900 dark:text-white text-base leading-relaxed
                                 font-medium"
                    >
                      {caption.content}
                    </p>
                  </div>

                  {/* Main Image */}
                  <div className="w-full flex-1 min-h-[320px] px-3 pb-3">
                    <Top100CaptionImage
                      src={displayUrl}
                      srcSet={srcSet}
                      captionId={caption.id}
                    />
                  </div>

                  {/* Bottom Action Bar */}
                  <div
                    className="p-3 bg-gray-50 dark:bg-[#1a1a1a] border-t border-gray-200
                               dark:border-white/10"
                  >
                    <div className="flex items-center justify-between">
                      <div
                        className="p-2 text-gray-600 dark:text-white hover:bg-gray-200/70
                                    dark:hover:bg-white/10 rounded transition-colors flex
                                    items-center justify-center"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <BookmarkButton
                          bookmarked={savedCaptions.includes(caption.id)}
                          onClick={() => handleSlideSave(caption.id)}
                          size={20}
                        />
                      </div>
                      <div
                        className="p-2 hover:bg-gray-200/70 dark:hover:bg-white/10 rounded
                                    transition-colors flex items-center justify-center"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <ShareModal
                          shareUrl={shareUrl}
                          buttonClassName="text-gray-600 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!isLoading && hasMore && (
        <div className="flex justify-center mt-8">
          <button
            onClick={loadMore}
            className="px-6 py-2 bg-primary/20 hover:bg-primary/30 text-primary
                             rounded-full transition-colors duration-200"
          >
            Load More
          </button>
        </div>
      )}

      {/* Modal */}
      {selectedIndex !== null && popularCaptions.length > 0 && (
        <CaptionModal
          items={popularCaptions.map((caption) => ({
            id: caption.id,
            content: caption.content,
            imageUrl: caption.image_url,
          }))}
          currentIndex={selectedIndex}
          onClose={handleCloseCarousel}
          onIndexChange={(index) => setSelectedIndex(index)}
          savedCaptionIds={savedCaptions}
          onSave={handleSlideSave}
          wrapNavigation
        />
      )}

      {/* New Post button */}
      <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-40">
        <a
          href="/new"
          className="flex items-center justify-center w-48 h-12 rounded-full
                    bg-primary text-primary-foreground font-bold text-lg shadow-lg
                    hover:bg-primary/90 transition-colors duration-200
                    select-none"
        >
          New Post
        </a>
      </div>
      {/* Login Prompt Modal */}
      <LoginPromptModal
        open={showLoginPrompt}
        onOpenChange={setShowLoginPrompt}
        onProceed={() => {
          setShowLoginPrompt(false);
          router.push("/login");
        }}
      />
    </div>
  );
}
