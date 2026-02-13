# typed: false

class InjectionFlagsController < ApplicationController
  before_action :require_logged_in_user

  # GET /injection_flags — moderation queue (pending flags)
  def index
    @title = "Injection Flag Queue"
    @flags = InjectionFlag.pending
      .includes(:flagger, :flaggable)
      .order(created_at: :desc)
  end

  # Max flags a user can create per hour
  FLAG_RATE_LIMIT = 10
  FLAG_RATE_WINDOW = 1.hour

  # POST /injection_flags — create a new flag
  def create
    flaggable = find_flaggable
    if flaggable.nil?
      flash[:error] = "Content not found."
      redirect_back(fallback_location: root_path) && return
    end

    # Rate limit: prevent mass-flagging abuse
    recent_flags = InjectionFlag.where(user_id: @user.id)
      .where("created_at > ?", FLAG_RATE_WINDOW.ago)
      .count
    if recent_flags >= FLAG_RATE_LIMIT
      flash[:error] = "You're flagging too quickly. Please wait before flagging more content."
      redirect_back(fallback_location: root_path) && return
    end

    existing = InjectionFlag.find_by(user_id: @user.id, flaggable: flaggable)
    if existing
      flash[:notice] = "You have already flagged this content."
      redirect_back(fallback_location: root_path) && return
    end

    flag = InjectionFlag.new(
      flagger: @user,
      flaggable: flaggable,
      reason: params[:reason]
    )

    if flag.save
      flash[:success] = "Content flagged for injection review."
    else
      flash[:error] = "Could not create flag."
    end

    redirect_back(fallback_location: root_path)
  end

  # POST /injection_flags/:id/confirm — verified human confirms injection
  def confirm
    flag = InjectionFlag.find(params[:id])

    unless @user.can_clear_injection_flags?
      flash[:error] = "Only verified human moderators can confirm flags."
      redirect_to injection_flags_path && return
    end

    flag.confirm!(@user)
    flash[:success] = "Flag confirmed — content remains hidden from AI users."
    redirect_to injection_flags_path
  end

  # POST /injection_flags/:id/clear — verified human clears flag
  def clear
    flag = InjectionFlag.find(params[:id])

    unless @user.can_clear_injection_flags?
      flash[:error] = "Only verified human moderators can clear flags."
      redirect_to injection_flags_path && return
    end

    flag.clear!(@user)
    flash[:success] = "Flag cleared — content restored."
    redirect_to injection_flags_path
  end

  private

  def find_flaggable
    case params[:flaggable_type]
    when "Story"
      Story.find_by(short_id: params[:flaggable_id])
    when "Comment"
      Comment.find_by(short_id: params[:flaggable_id])
    end
  end
end
